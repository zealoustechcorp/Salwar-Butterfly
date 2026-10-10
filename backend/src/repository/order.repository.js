// src/repository/order.repository.js
//
// Orders (F-07).
//
// Almost everything here is ordinary. The one part that is not is
// `create`, and it is the reason this file exists in the shape it does:
// placing an order has to reserve stock and write the order as a single
// indivisible act. If those come apart, the shop either sells a piece it
// does not have or holds a piece nobody bought, and neither is visible
// from any screen until a customer complains.
//
// The pattern is the one bulkAdjustStock already established — the
// arithmetic happens in SQL, guarded by a WHERE clause, inside one
// transaction that either lands whole or not at all.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";
import {
  CURRENCY,
  DEFAULT_SORT,
  ORDER_STATUS,
  orderSortSql,
  PAYMENT_STATUS,
  STATUS_TIMESTAMP_COLUMN,
} from "../config/order.policy.js";
import { NOTIFY_EVENT, eventForStatus } from "../config/whatsapp.policy.js";
import { NotificationService } from "../services/notification.service.js";
import { EmailService } from "../services/email.service.js";

/**
 * Codes the service translates into sentences a shopper can act on.
 *
 * Thrown rather than returned because they all abort a transaction —
 * there is no partial order to hand back.
 */
const fail = (code, fields = {}) => {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, fields);
  return error;
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Order repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

// ============================================================
// READ SHAPES
// ============================================================

/**
 * An order, its customer where there is one, and its lines.
 *
 * Two joins, each for its own reason.
 *
 * `customers` is a LEFT JOIN, not a JOIN: a guest order has no customer
 * row, and an inner join would silently drop exactly the orders that
 * are hardest to chase up.
 *
 * The lines arrive as a JSON array on the header row, from a LATERAL,
 * rather than as a second query per order — a twenty-order admin page
 * would otherwise be twenty-one round trips. COALESCE because an order
 * with no lines should read as `[]`, not null; that state should not
 * exist, but a list screen should not crash if it ever does.
 */
const SELECT_ORDER = `
  SELECT
    o.*,
    c.name  AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    lines.items AS items
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id',           i.id,
          'product_id',   i.product_id,
          'variant_id',   i.variant_id,
          'product_name', i.product_name,
          'product_slug', i.product_slug,
          'size',         i.size,
          'image_url',    i.image_url,
          'unit_price',   i.unit_price,
          'quantity',     i.quantity,
          'line_total',   i.line_total
        )
        ORDER BY i.product_name ASC, i.size ASC
      ),
      '[]'::json
    ) AS items
    FROM order_items i
    WHERE i.order_id = o.id
  ) lines ON TRUE
`;

/**
 * Builds the shared WHERE clause for the list queries.
 *
 * @returns {{clause: string, values: unknown[]}} `clause` includes the
 *          leading WHERE, or is empty when nothing was filtered.
 */
const buildFilters = ({
  customerId = null,
  status = null,
  paymentStatus = null,
  search = null,
  placedFrom = null,
  placedTo = null,
} = {}) => {
  const conditions = [];
  const values = [];

  if (customerId) {
    values.push(customerId);
    conditions.push(`o.customer_id = $${values.length}::uuid`);
  }

  if (status) {
    values.push(status);
    conditions.push(`o.status = $${values.length}`);
  }

  if (paymentStatus) {
    values.push(paymentStatus);
    conditions.push(`o.payment_status = $${values.length}`);
  }

  if (placedFrom) {
    values.push(placedFrom);
    conditions.push(`o.placed_at >= $${values.length}::timestamptz`);
  }

  if (placedTo) {
    values.push(placedTo);
    conditions.push(`o.placed_at <= $${values.length}::timestamptz`);
  }

  if (search) {
    values.push(`%${search}%`);
    const like = `$${values.length}`;

    // The order number matches by prefix as well as anywhere, so typing
    // "1042" finds SB-001042. The rest are the three ways a shop
    // identifies a parcel when the customer cannot find their number.
    conditions.push(
      `(o.order_number ILIKE ${like}
        OR o.contact_name ILIKE ${like}
        OR o.contact_email ILIKE ${like}
        OR o.contact_phone ILIKE ${like})`,
    );
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
};

export const OrderRepository = {
  // ==========================================================
  // PLACE AN ORDER
  // ==========================================================

  /**
   * Reserves the stock and writes the order, as one transaction.
   *
   * Four steps, in this order, and the order matters:
   *
   *   1. Lock every variant on the order, sorted by id.
   *   2. Price the lines from the *database*, never from the request.
   *   3. Decrement stock, guarded so it cannot go below zero.
   *   4. Write the header and its lines.
   *
   * Step 1 is what makes two simultaneous checkouts for the last piece
   * resolve rather than race: the second transaction blocks on the row
   * lock until the first commits, then sees the decremented count and is
   * refused by step 3. Sorting the ids means two orders sharing two
   * pieces always take those locks in the same sequence, so they queue
   * instead of deadlocking.
   *
   * Step 2 is the security-relevant one. The request carries variant ids
   * and quantities and nothing else — a client that could send a price
   * could send its own.
   *
   * @param {object} input
   * @param {string|null} input.customerId    null for a guest checkout
   * @param {object} input.contact            name, email, phone
   * @param {object} input.shipping           address snapshot
   * @param {Array<{variantId: string, quantity: number}>} input.lines
   * @param {number} input.shippingFee
   * @param {string|null} input.customerNote
   */
  async create({
    customerId = null,
    contact,
    shipping,
    lines,
    shippingFee = 0,
    customerNote = null,
    whatsappOptIn = undefined,
  }) {
    try {
      return await withTransaction(async (client) => {
        // ------------------------------------------------------
        // 1 + 2. LOCK AND PRICE
        // ------------------------------------------------------
        //
        // FOR UPDATE OF v locks the variant rows only. The products
        // and categories joined alongside are read for their names and
        // prices and are not being changed, so locking them would block
        // an admin editing an unrelated field on the same product for
        // the length of a checkout.
        //
        // The cover photo comes from a LATERAL taking the first image.
        // Postgres will not lock across the nullable side of an outer
        // join, which is another reason the lock is scoped to `v`.

        const variantIds = [...lines]
          .map((line) => line.variantId)
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        const priced = await client.query(
          `SELECT
             v.id,
             v.product_id,
             v.size,
             v.stock_quantity,
             v.active          AS variant_active,
             p.name            AS product_name,
             p.slug            AS product_slug,
             p.current_price   AS unit_price,
             p.active          AS product_active,
             img.image_url     AS image_url
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           LEFT JOIN LATERAL (
             SELECT pi.image_url
             FROM product_images pi
             WHERE pi.product_id = p.id
             ORDER BY pi.position ASC, pi.created_at ASC
             LIMIT 1
           ) img ON TRUE
           WHERE v.id = ANY($1::uuid[])
           ORDER BY v.id
           FOR UPDATE OF v`,
          [variantIds],
        );

        const byId = new Map(priced.rows.map((row) => [row.id, row]));

        // ------------------------------------------------------
        // 3. RESERVE
        // ------------------------------------------------------

        const items = [];
        let subtotal = 0;

        for (const line of lines) {
          const variant = byId.get(line.variantId);

          if (!variant) {
            throw fail("VARIANT_NOT_FOUND", { variantId: line.variantId });
          }

          // A piece can be taken off sale between being added to the bag
          // and checkout. Refusing here is the difference between "we
          // stopped selling that" and an order the shop cannot fulfil.
          if (!variant.variant_active || !variant.product_active) {
            throw fail("VARIANT_UNAVAILABLE", {
              variantId: line.variantId,
              productName: variant.product_name,
              size: variant.size,
            });
          }

          // Checked before the UPDATE so the message can name the count.
          // The guarded UPDATE below is still the thing that makes it
          // safe — this check is for the wording, not the correctness.
          const available = Number(variant.stock_quantity);

          if (available < line.quantity) {
            throw fail("INSUFFICIENT_STOCK", {
              variantId: line.variantId,
              productName: variant.product_name,
              size: variant.size,
              available,
              requested: line.quantity,
            });
          }

          const reserved = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity - $2,
                 updated_at = NOW()
             WHERE id = $1::uuid
               AND stock_quantity - $2 >= 0
             RETURNING stock_quantity`,
            [line.variantId, line.quantity],
          );

          // Unreachable while the row lock above is held — kept because
          // the guard is what actually enforces this, and a silent
          // no-op here would write an order for stock nobody has.
          if (reserved.rowCount === 0) {
            throw fail("INSUFFICIENT_STOCK", {
              variantId: line.variantId,
              productName: variant.product_name,
              size: variant.size,
              available,
              requested: line.quantity,
            });
          }

          const unitPrice = Number(variant.unit_price);
          subtotal += unitPrice * line.quantity;

          items.push({
            productId: variant.product_id,
            variantId: variant.id,
            productName: variant.product_name,
            productSlug: variant.product_slug,
            size: variant.size,
            imageUrl: variant.image_url,
            unitPrice,
            quantity: line.quantity,
          });
        }

        // Rounded once, at the end, to the paisa. Accumulating rounded
        // line totals and rounding again is how a total drifts a paisa
        // away from what the gateway is asked to charge.
        const roundedSubtotal = Math.round(subtotal * 100) / 100;
        const fee = Math.round(Number(shippingFee) * 100) / 100;
        const total = Math.round((roundedSubtotal + fee) * 100) / 100;

        // ------------------------------------------------------
        // 4. WRITE THE ORDER
        // ------------------------------------------------------
        //
        // order_number is left to its DEFAULT so the sequence assigns
        // it — two checkouts in the same millisecond cannot collide.

        const orderResult = await client.query(
          `INSERT INTO orders (
             customer_id,
             contact_name, contact_email, contact_phone,
             shipping_line1, shipping_line2, shipping_landmark,
             shipping_city, shipping_state, shipping_postal_code,
             shipping_country,
             status, payment_status,
             subtotal, shipping_fee, total, currency,
             customer_note,
             whatsapp_opt_in, whatsapp_opt_in_at
           ) VALUES (
             $1::uuid,
             $2, $3, $4,
             $5, $6, $7,
             $8, $9, $10,
             $11,
             $12, $13,
             $14, $15, $16, $17,
             $18,
             -- COALESCE so that a client which said nothing gets the
             -- column's own DEFAULT rather than a NULL that would
             -- violate NOT NULL. The timestamp is only stamped when the
             -- answer was yes, because there is no consent to date
             -- otherwise.
             COALESCE($19::boolean, TRUE),
             CASE WHEN COALESCE($19::boolean, TRUE) THEN NOW() ELSE NULL END
           )
           RETURNING *`,
          [
            customerId,
            contact.name,
            contact.email,
            contact.phone,
            shipping.line1,
            shipping.line2,
            shipping.landmark,
            shipping.city,
            shipping.state,
            shipping.postalCode,
            shipping.country,
            ORDER_STATUS.PENDING_PAYMENT,
            PAYMENT_STATUS.PENDING,
            roundedSubtotal,
            fee,
            total,
            CURRENCY,
            customerNote,
            whatsappOptIn ?? null,
          ],
        );

        const order = orderResult.rows[0];

        // One INSERT for every line rather than one per line. UNNEST
        // over parallel arrays keeps it to a single round trip whatever
        // the bag holds.
        await client.query(
          `INSERT INTO order_items (
             order_id, product_id, variant_id,
             product_name, product_slug, size, image_url,
             unit_price, quantity
           )
           SELECT
             $1::uuid,
             p.product_id, p.variant_id,
             p.product_name, p.product_slug, p.size, p.image_url,
             p.unit_price, p.quantity
           FROM UNNEST(
             $2::uuid[], $3::uuid[],
             $4::text[], $5::text[], $6::text[], $7::text[],
             $8::numeric[], $9::int[]
           ) AS p(
             product_id, variant_id,
             product_name, product_slug, size, image_url,
             unit_price, quantity
           )`,
          [
            order.id,
            items.map((item) => item.productId),
            items.map((item) => item.variantId),
            items.map((item) => item.productName),
            items.map((item) => item.productSlug),
            items.map((item) => item.size),
            items.map((item) => item.imageUrl),
            items.map((item) => item.unitPrice),
            items.map((item) => item.quantity),
          ],
        );

        logger.info("Order placed", {
          orderId: order.id,
          orderNumber: order.order_number,
          lines: items.length,
          total,
          guest: customerId === null,
        });

        return order.id;
      });
    } catch (error) {
      if (
        error?.code === "VARIANT_NOT_FOUND" ||
        error?.code === "VARIANT_UNAVAILABLE" ||
        error?.code === "INSUFFICIENT_STOCK"
      ) {
        throw error;
      }

      throw handleDatabaseError(error, "create", {
        customerId,
        lines: lines?.length,
      });
    }
  },

  // ==========================================================
  // READ
  // ==========================================================

  /**
   * `client` runs the read inside a caller's open transaction rather
   * than on the pool. PaymentService needs that: it re-reads the order's
   * status while holding the lock that stops two payment sheets being
   * opened at once, and a pooled read would answer from outside that
   * transaction and could miss a write it is meant to be serialised with.
   */
  async findById(id, { client = null } = {}) {
    const text = `
      ${SELECT_ORDER}
      WHERE o.id = $1::uuid
      LIMIT 1
    `;

    try {
      const run = client ? client.query.bind(client) : query;
      const result = await run(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { orderId: id });
    }
  },

  /**
   * By the number a customer reads off their confirmation.
   *
   * Case-folded, matching the index — it will be typed in lower case at
   * least as often as it is pasted.
   */
  async findByOrderNumber(orderNumber) {
    const text = `
      ${SELECT_ORDER}
      WHERE LOWER(o.order_number) = LOWER($1)
      LIMIT 1
    `;

    try {
      const result = await query(text, [orderNumber]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByOrderNumber", { orderNumber });
    }
  },

  /**
   * A page of orders.
   *
   * The same query serves the admin queue and a customer's own history —
   * the difference is entirely the `customerId` filter, applied by the
   * service. Two near-identical queries would be two places to forget
   * that filter, and forgetting it once serves one shopper another
   * shopper's address.
   */
  async findAll({
    customerId = null,
    status = null,
    paymentStatus = null,
    search = null,
    placedFrom = null,
    placedTo = null,
    sort = DEFAULT_SORT,
    page = 1,
    limit = 25,
  } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const { clause, values } = buildFilters({
      customerId,
      status,
      paymentStatus,
      search,
      placedFrom,
      placedTo,
    });

    const text = `
      ${SELECT_ORDER}
      ${clause}
      ORDER BY ${orderSortSql(sort)}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const countText = `
      SELECT COUNT(*)::INTEGER AS count
      FROM orders o
      ${clause}
    `;

    try {
      const [result, countResult] = await Promise.all([
        query(text, [...values, safeLimit, offset]),
        query(countText, values),
      ]);

      return {
        rows: result.rows,
        total: countResult.rows[0]?.count ?? 0,
      };
    } catch (error) {
      throw handleDatabaseError(error, "findAll", { status, sort });
    }
  },

  /**
   * Counts per status, over the whole book rather than the current page.
   *
   * One grouped query rather than six counts, so the tiles are read at a
   * single instant and cannot disagree with each other.
   */
  async summary({ customerId = null } = {}) {
    const { clause, values } = buildFilters({ customerId });

    const text = `
      SELECT
        o.status,
        COUNT(*)::INTEGER AS order_count,
        COALESCE(SUM(o.total), 0)::NUMERIC(12,2) AS revenue
      FROM orders o
      ${clause}
      GROUP BY o.status
    `;

    try {
      const result = await query(text, values);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "summary", { customerId });
    }
  },

  // ==========================================================
  // MOVE AN ORDER ALONG
  // ==========================================================

  /**
   * Applies one status transition.
   *
   * `expectedStatus` makes the write conditional: the UPDATE only lands
   * if the order is still where the screen thought it was. Two admins
   * with the same order open would otherwise both succeed, and the
   * second would silently undo the first — an order marked shipped and
   * then marked packed again.
   *
   * Which timestamp a status stamps comes from the policy module rather
   * than a switch here, so "what shipped means" is decided in one place.
   *
   * @returns {object|null} the updated row, or null when the order was
   *          not in `expectedStatus` — the caller re-reads to say why.
   */
  async updateStatus(id, expectedStatus, nextStatus, { note = null, shipment = null } = {}) {
    const stampColumn = STATUS_TIMESTAMP_COLUMN[nextStatus] ?? null;

    // The column name is looked up from a frozen map keyed by a status
    // the validator has already checked — never caller text.
    const stampSql = stampColumn ? `, ${stampColumn} = NOW()` : "";

    const text = `
      UPDATE orders
      SET status = $3,
          admin_note = COALESCE($4, admin_note),
          courier_name = COALESCE($5, courier_name),
          tracking_number = COALESCE($6, tracking_number),
          tracking_url = COALESCE($7, tracking_url),
          updated_at = NOW()
          ${stampSql}
      WHERE id = $1::uuid
        AND status = $2
      RETURNING *
    `;

    try {
      // A transaction around what is still one guarded UPDATE. That
      // changes nothing about its semantics — it was already atomic —
      // and gives the notification emit a SAVEPOINT to live in, so the
      // transition and the promise to announce it commit together.
      const { row, notificationIds, emailIds } = await withTransaction(async (client) => {
        const result = await client.query(text, [
          id,
          expectedStatus,
          nextStatus,
          note,
          shipment?.courierName ?? null,
          shipment?.trackingNumber ?? null,
          shipment?.trackingUrl ?? null,
        ]);

        if (result.rowCount === 0) return { row: null, notificationIds: [], emailIds: [] };

        const updated = result.rows[0];

        logger.info("Order status changed", {
          orderId: id,
          from: expectedStatus,
          to: nextStatus,
        });

        // rowCount > 0 means *this* call made the move, which is what
        // makes the emit exactly-once even with two admins in two tabs.
        const ids = await NotificationService.emitTx(
          client,
          updated,
          eventForStatus(nextStatus),
        );

        // Packed carries the tracking number written by this same UPDATE.
        const emails = await EmailService.emitTx(client, updated, eventForStatus(nextStatus));

        return { row: updated, notificationIds: ids, emailIds: emails };
      });

      NotificationService.dispatch(notificationIds);
      EmailService.dispatch(emailIds);

      return row;
    } catch (error) {
      throw handleDatabaseError(error, "updateStatus", {
        orderId: id,
        nextStatus,
      });
    }
  },

  /**
   * Confirms an order: payment received, parcel can be picked.
   *
   * Both axes move together here and nowhere else — this is the single
   * point at which money and parcel are known to agree, so writing them
   * in one statement is what keeps "confirmed but unpaid" out of the
   * table.
   *
   * When a gateway lands, its webhook calls this. Until then an admin
   * does, after seeing the transfer.
   *
   * @param {string|null} reference  the gateway's payment id, where
   *                                 there is one
   */
  async confirmPayment(id, { reference = null } = {}) {
    const text = `
      UPDATE orders
      SET status = $2,
          payment_status = $3,
          paid_at = COALESCE(paid_at, NOW()),
          admin_note = COALESCE($4, admin_note),
          updated_at = NOW()
      WHERE id = $1::uuid
        AND status = $5
      RETURNING *
    `;

    try {
      const { row, notificationIds, emailIds } = await withTransaction(async (client) => {
        const result = await client.query(text, [
          id,
          ORDER_STATUS.CONFIRMED,
          PAYMENT_STATUS.PAID,
          reference,
          ORDER_STATUS.PENDING_PAYMENT,
        ]);

        if (result.rowCount === 0) return { row: null, notificationIds: [], emailIds: [] };

        const confirmed = result.rows[0];

        logger.info("Order payment confirmed", { orderId: id, reference });

        // The manual counterpart to PaymentRepository.settle's emit.
        // Both guard on `status = 'pending_payment'`, so only one of
        // them can ever apply to a given order — and if that reasoning
        // were somehow wrong, the two would produce the same dedupe_key
        // and collapse into one row anyway. Belt and braces, on the one
        // path that moves money.
        const { rows: counts } = await client.query(
          `SELECT COALESCE(SUM(quantity), 0)::int AS units
             FROM order_items
            WHERE order_id = $1::uuid`,
          [confirmed.id],
        );

        const ids = await NotificationService.emitTx(
          client,
          confirmed,
          NOTIFY_EVENT.ORDER_PAID,
          { unitCount: counts[0]?.units ?? null },
        );

        const emails = await EmailService.emitTx(client, confirmed, NOTIFY_EVENT.ORDER_PAID);

        return { row: confirmed, notificationIds: ids, emailIds: emails };
      });

      NotificationService.dispatch(notificationIds);
      EmailService.dispatch(emailIds);

      return row;
    } catch (error) {
      throw handleDatabaseError(error, "confirmPayment", { orderId: id });
    }
  },

  /**
   * Cancels an order and puts its pieces back on the shelf, as one
   * transaction.
   *
   * The two halves must not come apart in either direction. A
   * cancellation that does not restore stock leaves the shop unable to
   * sell something it holds; a restore that does not cancel hands the
   * same piece to two shoppers.
   *
   * Stock is only restored for lines whose variant still exists —
   * `variant_id` is nulled when a variant is deleted, and there is
   * nothing to give back to a row that is gone.
   *
   * @param {string[]} cancellableFrom  statuses this may be applied to,
   *                                    checked inside the transaction so
   *                                    a concurrent dispatch cannot slip
   *                                    between the check and the write
   * @returns {object|null} the cancelled row, or null if it was not in
   *                        one of those statuses
   */
  async cancel(id, { reason = null, cancellableFrom = [] } = {}) {
    try {
      const { row, notificationIds } = await withTransaction(async (client) => {
        const cancelled = await client.query(
          `UPDATE orders
           SET status = $2,
               cancellation_reason = $3,
               cancelled_at = NOW(),
               updated_at = NOW()
           WHERE id = $1::uuid
             AND status = ANY($4::text[])
           RETURNING *`,
          [id, ORDER_STATUS.CANCELLED, reason, cancellableFrom],
        );

        if (cancelled.rowCount === 0) return { row: null, notificationIds: [] };

        // One statement rather than a loop: the lines of one order touch
        // distinct variants (enforced by uq_order_items_order_variant),
        // so there is no line-by-line accumulation to do.
        const restored = await client.query(
          `UPDATE product_variants v
           SET stock_quantity = v.stock_quantity + i.quantity,
               updated_at = NOW()
           FROM order_items i
           WHERE i.order_id = $1::uuid
             AND i.variant_id = v.id
           RETURNING v.id`,
          [id],
        );

        logger.info("Order cancelled", {
          orderId: id,
          variantsRestored: restored.rowCount,
        });

        // After the stock is back on the shelf, so that a message
        // promising a cancellation cannot outlive a rollback of it.
        const ids = await NotificationService.emitTx(
          client,
          cancelled.rows[0],
          NOTIFY_EVENT.ORDER_CANCELLED,
        );

        return { row: cancelled.rows[0], notificationIds: ids };
      });

      NotificationService.dispatch(notificationIds);

      return row;
    } catch (error) {
      throw handleDatabaseError(error, "cancel", { orderId: id });
    }
  },
};
