// src/repository/payment.repository.js
//
// Payment attempts (F-10).
//
// One method here is not ordinary and it is the reason this file exists
// in this shape: `settle`. Banking a payment is two writes — the attempt
// becomes `paid`, and the order it belongs to becomes `confirmed` /
// `paid` — and they must not come apart. If they do, the shop has either
// taken money for an order that still reads "awaiting payment" and will
// never be picked, or confirmed an order against an attempt that is not
// recorded as having paid for it. Neither is visible from any screen
// until a customer calls.
//
// So both statements run against one client inside one transaction, the
// pattern OrderRepository.create already established for reserving stock.

import * as Sentry from "@sentry/node";

import { withTransaction, query } from "../config/db.js";
import { logger } from "../utils/logger.js";
import {
  DEFAULT_PROVIDER,
  PAYMENT_ATTEMPT_STATUS,
} from "../config/payment.policy.js";
import {
  ASSIGN_ORDER_NUMBER_SQL,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from "../config/order.policy.js";
import { NOTIFY_EVENT } from "../config/whatsapp.policy.js";
import { NotificationService } from "../services/notification.service.js";
import { EmailService } from "../services/email.service.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Payment repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

/**
 * Runs on a transaction's client when there is one, and on the pool
 * otherwise.
 *
 * Two reads and one insert in this file have to be able to do both: the
 * ordinary path wants a pooled query, and `withSessionLock` needs them
 * on its own client or they would not see — and would not be protected
 * by — the transaction holding the lock.
 */
const runner = (client) => (client ? client.query.bind(client) : query);

/**
 * A 60-bit advisory lock key from an order's UUID.
 *
 * Postgres advisory locks are keyed by integer, and the thing being
 * serialised is identified by a UUID, so the two have to be bridged
 * somewhere. The first fifteen hex digits are taken: sixty bits, which
 * is always inside a signed bigint and never negative, so no sign
 * handling is needed at either end.
 *
 * Truncating throws away entropy and that is fine here. A collision
 * between two different orders costs one of them a brief wait behind a
 * lock it did not need; at 2^60 keys it will not happen, and if it did,
 * nothing would be wrong — only slightly slower.
 */
const sessionLockKey = (orderId) =>
  BigInt(`0x${String(orderId).replace(/-/g, "").slice(0, 15)}`).toString();

const COLUMNS = `
  id,
  order_id,
  provider,
  provider_order_id,
  provider_payment_id,
  status,
  amount,
  currency,
  method,
  error_code,
  error_description,
  created_at,
  paid_at,
  updated_at
`;

/**
 * Puts a lapsed checkout back together when its payment lands late.
 *
 * A draft's hold is short (CHECKOUT_HOLD_MINUTES), and a payment can be
 * in flight when it runs out — a UPI collect request approved a minute
 * after the sheet closed, a webhook delayed by a retry. The sweeper has
 * by then cancelled the draft and put its pieces back. The shopper has
 * paid, though, so before falling back to a refund this tries to take
 * the same pieces off the shelf again, at the price the draft recorded.
 *
 * The same lock-sorted, guarded decrement OrderRepository.create uses,
 * inside a SAVEPOINT so that a piece which has since sold rolls back
 * only this attempt and leaves the caller's transaction usable.
 *
 * Only for a cancelled *draft* (no order number). A placed order that
 * was cancelled was cancelled by a person, on purpose.
 *
 * @returns {Promise<object|null>} the confirmed order row, or null when
 *          the stock is no longer there (the caller records a refund)
 */
const reviveLapsedDraft = async (client, orderId) => {
  await client.query("SAVEPOINT revive_draft");

  try {
    const { rows: lines } = await client.query(
      `SELECT variant_id, quantity
         FROM order_items
        WHERE order_id = $1::uuid
        ORDER BY variant_id`,
      [orderId],
    );

    // A variant deleted since: nothing to take, so nothing to ship.
    if (lines.length === 0 || lines.some((line) => !line.variant_id)) {
      await client.query("ROLLBACK TO SAVEPOINT revive_draft");
      return null;
    }

    await client.query(
      `SELECT id FROM product_variants
        WHERE id = ANY($1::uuid[])
        ORDER BY id
        FOR UPDATE`,
      [lines.map((line) => line.variant_id)],
    );

    for (const line of lines) {
      const taken = await client.query(
        `UPDATE product_variants
            SET stock_quantity = stock_quantity - $2,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND stock_quantity - $2 >= 0`,
        [line.variant_id, line.quantity],
      );

      if (taken.rowCount === 0) {
        await client.query("ROLLBACK TO SAVEPOINT revive_draft");
        return null;
      }
    }

    const revived = await client.query(
      `UPDATE orders
          SET status = $2,
              payment_status = $3,
              paid_at = COALESCE(paid_at, NOW()),
              cancelled_at = NULL,
              cancellation_reason = NULL,
              order_number = ${ASSIGN_ORDER_NUMBER_SQL},
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = $4
          AND order_number IS NULL
        RETURNING *`,
      [orderId, ORDER_STATUS.CONFIRMED, PAYMENT_STATUS.PAID, ORDER_STATUS.CANCELLED],
    );

    if (revived.rowCount === 0) {
      await client.query("ROLLBACK TO SAVEPOINT revive_draft");
      return null;
    }

    await client.query("RELEASE SAVEPOINT revive_draft");

    logger.warn("Lapsed checkout revived by a late payment", {
      orderId,
      orderNumber: revived.rows[0].order_number,
    });

    return revived.rows[0];
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT revive_draft").catch(() => {});
    throw error;
  }
};

export const PaymentRepository = {
  // ==========================================================
  // OPEN AN ATTEMPT
  // ==========================================================

  /**
   * Serialises everything that opens a payment sheet for one order.
   *
   * The problem this solves is not one the table's constraints can. A
   * shopper who double-clicks "Pay now" sends two requests that both
   * read "this order is still awaiting payment", both ask Razorpay for
   * an order, and both insert — and the unique constraints do not fire,
   * because they are on the provider's ids and Razorpay has just minted
   * two different ones. Every duplicate is a live order on the Razorpay
   * dashboard that no settlement will ever match.
   *
   * A transaction-scoped advisory lock is what makes the second request
   * *see* what the first did. It is keyed on the order, so two shoppers
   * paying for different orders never wait for each other; it is held
   * for the transaction and released by COMMIT or ROLLBACK, including
   * the rollback of a process that died mid-call, which is the failure
   * a lock table in the database would have to be swept for.
   *
   * `retries: 0`, against the default. `fn` sends an HTTP request to a
   * payment provider — a side effect that lives outside the transaction
   * and cannot be rolled back with it, so re-running the callback could
   * open a second Razorpay order for the attempt that is about to
   * succeed. The retries exist for deadlocks and serialization
   * failures, and this shape produces neither: one advisory lock taken
   * first, two reads and an insert under READ COMMITTED. Trading an
   * error that will not occur for a duplicate that would be invisible
   * is the wrong way round.
   *
   * @template T
   * @param {string} orderId
   * @param {(client: import('pg').PoolClient) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withSessionLock(orderId, fn) {
    return withTransaction(
      async (client) => {
        try {
          await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
            sessionLockKey(orderId),
          ]);
        } catch (error) {
          throw handleDatabaseError(error, "withSessionLock", { orderId });
        }

        // Deliberately outside the try: what `fn` throws is the
        // service's business — a 409 for an order already paid, a 502
        // from the gateway — and logging those as repository failures
        // would bury the real ones.
        return fn(client);
      },
      { retries: 0 },
    );
  },

  /**
   * The newest attempt on this order that is still open — `created`,
   * never `failed` or `paid` — plus how old the attempt is, measured by
   * the database.
   *
   * The age exists for the reuse window in PaymentService.createSession,
   * and it is computed here rather than there because `created_at` is
   * stamped by the database clock and the API host's clock is a
   * different one. The live database runs about two seconds ahead, so
   * `Date.now() - created_at` came out *negative* for a row written a
   * moment ago; the service read a negative age as "not a recent
   * attempt" and minted a fresh Razorpay order for every click in the
   * first two seconds — five sessions in one second in the stress test,
   * lock and all. Subtracting inside Postgres compares one clock with
   * itself.
   *
   * `clock_timestamp()` and not `NOW()`: NOW() is frozen at the start of
   * the transaction, and this runs inside `withSessionLock` after
   * waiting for the lock — a transaction that began before the one it
   * queued behind would see that one's row as younger than zero.
   * GREATEST clamps whatever is left of that to zero.
   */
  async findLatestOpenAttemptWithAge(
    orderId,
    { client = null, provider = DEFAULT_PROVIDER } = {},
  ) {
    const text = `
      SELECT ${COLUMNS},
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - created_at)) * 1000)
        )::bigint AS age_ms
      FROM payments
      WHERE order_id = $1::uuid
        AND provider = $2
        AND status = $3
      ORDER BY created_at DESC
      LIMIT 1
    `;

    try {
      const result = await runner(client)(text, [
        orderId,
        provider,
        PAYMENT_ATTEMPT_STATUS.CREATED,
      ]);

      const row = result.rows[0] ?? null;

      // pg hands bigint back as a string.
      return row ? { ...row, age_ms: Number(row.age_ms) } : null;
    } catch (error) {
      throw handleDatabaseError(error, "findLatestOpenAttemptWithAge", { orderId });
    }
  },

  /**
   * Records that a payment sheet was opened.
   *
   * Written *before* the shopper sees the sheet, not after they pay. An
   * attempt that is created and abandoned is the normal case and is
   * worth having: without this row, a webhook for a payment we never
   * recorded has nothing to attach to.
   *
   * Takes an optional client so the insert can happen inside the
   * `withSessionLock` transaction that decided it was needed. Outside
   * that transaction the row would be visible to the next caller only
   * after it commits, which is the gap the lock exists to close.
   */
  async create(
    {
      orderId,
      provider = DEFAULT_PROVIDER,
      providerOrderId,
      amount,
      currency,
    },
    { client = null } = {},
  ) {
    const text = `
      INSERT INTO payments (
        order_id, provider, provider_order_id, status, amount, currency
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      RETURNING ${COLUMNS}
    `;

    try {
      const result = await runner(client)(text, [
        orderId,
        provider,
        providerOrderId,
        PAYMENT_ATTEMPT_STATUS.CREATED,
        amount,
        currency,
      ]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "create", { orderId, providerOrderId });
    }
  },

  // ==========================================================
  // READS
  // ==========================================================

  async findById(id) {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM payments WHERE id = $1::uuid LIMIT 1`,
        [id],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { paymentId: id });
    }
  },

  /**
   * The attempt a gateway callback is talking about.
   *
   * Both the checkout return and the webhook arrive knowing the
   * provider's order id, which is why that column is unique per
   * provider — this lookup has to be exact.
   */
  async findByProviderOrderId(providerOrderId, provider = DEFAULT_PROVIDER) {
    try {
      const result = await query(
        `SELECT ${COLUMNS}
         FROM payments
         WHERE provider = $1 AND provider_order_id = $2
         LIMIT 1`,
        [provider, providerOrderId],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByProviderOrderId", {
        providerOrderId,
      });
    }
  },

  /**
   * The still-unsettled attempts behind a set of Razorpay order ids.
   *
   * For the payment reconciler: of the payments Razorpay says it
   * captured, which ones belong to an attempt of ours that was never
   * marked paid. `created` and `failed` are exactly the statuses
   * `settle` accepts, so anything returned here is something settle can
   * still act on, and anything it has already settled drops out.
   */
  async findUnsettledByProviderOrderIds(providerOrderIds, provider = DEFAULT_PROVIDER) {
    if (!providerOrderIds?.length) return [];

    try {
      const result = await query(
        `SELECT ${COLUMNS}
         FROM payments
         WHERE provider = $1
           AND provider_order_id = ANY($2::text[])
           AND status IN ($3, $4)`,
        [
          provider,
          providerOrderIds,
          PAYMENT_ATTEMPT_STATUS.CREATED,
          PAYMENT_ATTEMPT_STATUS.FAILED,
        ],
      );

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findUnsettledByProviderOrderIds", {
        count: providerOrderIds.length,
      });
    }
  },

  /**
   * The attempt a refund notification is talking about.
   *
   * A refund entity names the payment it reverses, never the order, so
   * this is the one lookup that goes in by payment id. Guarded against a
   * null argument because `provider_payment_id` is NULL on every
   * abandoned attempt, and `= NULL` would match none of them while
   * `IS NULL` would match all of them — the second is the dangerous one.
   */
  async findByProviderPaymentId(providerPaymentId, provider = DEFAULT_PROVIDER) {
    if (!providerPaymentId) return null;

    try {
      const result = await query(
        `SELECT ${COLUMNS}
         FROM payments
         WHERE provider = $1 AND provider_payment_id = $2
         LIMIT 1`,
        [provider, providerPaymentId],
      );

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByProviderPaymentId", {
        providerPaymentId,
      });
    }
  },

  /** Every attempt on one order, newest first — the admin order page. */
  async listByOrder(orderId) {
    try {
      const result = await query(
        `SELECT ${COLUMNS}
         FROM payments
         WHERE order_id = $1::uuid
         ORDER BY created_at DESC`,
        [orderId],
      );

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "listByOrder", { orderId });
    }
  },

  // ==========================================================
  // SETTLE
  // ==========================================================

  /**
   * Banks a verified payment: the attempt is paid, and its order is
   * confirmed. One transaction, or neither.
   *
   * Both UPDATEs are guarded on the status they expect to find rather
   * than written unconditionally, and that guard is what makes this
   * callable twice. It will be called twice: Razorpay sends a webhook
   * for the same capture the browser has already reported, and retries
   * that webhook for a day if it does not see a 2xx. So the second call
   * matches nothing, changes nothing, and is reported as `alreadyPaid`
   * rather than as an error — the caller returns 200 to stop the retries.
   *
   * The order UPDATE is deliberately a copy of OrderRepository.confirmPayment
   * rather than a call to it: that method runs on the pool, and running
   * it here would put the order write outside this transaction, which is
   * the exact failure this method exists to prevent. The two are kept
   * honest by both reading their statuses from order.policy.js.
   *
   * An order that is no longer `pending_payment` when a payment settles
   * still has the attempt marked paid — the capture happened and cannot
   * be un-happened from here. Either the order was cancelled while the
   * sheet was open, or it had already been paid (a transfer an admin
   * confirmed by hand, or a second attempt). Both leave money the shop
   * owes back, so the result carries `unmatched`, the order reads as
   * refund-due, and the event goes to Sentry.
   *
   * A `failed` attempt settles too, and must. A Razorpay order outlives a
   * declined payment: the sheet stays open, offers "Retry payment", and
   * the retry is a new payment against the same order — so the same row.
   * By then payment.failed has already marked it failed, and guarding on
   * `created` alone would refuse the capture that followed while still
   * reporting `alreadyPaid`: money taken, order left pending, nobody
   * told. Only `paid` and `refunded` are terminal, and those are what the
   * guard still excludes. The failure's error fields are cleared, since
   * they describe a payment that is no longer the one this row records.
   */
  async settle(paymentId, { providerPaymentId, method = null }) {
    try {
      const result = await withTransaction(async (client) => {
        const paid = await client.query(
          `UPDATE payments
           SET status = $2,
               provider_payment_id = $3,
               method = COALESCE($4, method),
               error_code = NULL,
               error_description = NULL,
               paid_at = COALESCE(paid_at, NOW()),
               updated_at = NOW()
           WHERE id = $1::uuid
             AND status IN ($5, $6)
           RETURNING ${COLUMNS}`,
          [
            paymentId,
            PAYMENT_ATTEMPT_STATUS.PAID,
            providerPaymentId,
            method,
            PAYMENT_ATTEMPT_STATUS.CREATED,
            PAYMENT_ATTEMPT_STATUS.FAILED,
          ],
        );

        if (paid.rowCount === 0) {
          return { payment: null, order: null, alreadyPaid: true, notificationIds: [], emailIds: [] };
        }

        const payment = paid.rows[0];

        // Paying is placing: this is where a checkout draft becomes an
        // order and is given its number.
        const order = await client.query(
          `UPDATE orders
           SET status = $2,
               payment_status = $3,
               paid_at = COALESCE(paid_at, NOW()),
               order_number = ${ASSIGN_ORDER_NUMBER_SQL},
               updated_at = NOW()
           WHERE id = $1::uuid
             AND status = $4
           RETURNING *`,
          [
            payment.order_id,
            ORDER_STATUS.CONFIRMED,
            PAYMENT_STATUS.PAID,
            ORDER_STATUS.PENDING_PAYMENT,
          ],
        );

        // Money was taken but the order was not waiting for it. Two ways
        // in, both real: the order was cancelled while the shopper still
        // had the Razorpay sheet open, or it had already been paid — by an
        // admin's manual confirmation or by another attempt. The capture
        // cannot be undone from here, so it is recorded truthfully and the
        // order is left reading "refund due" (see REFUND_DUE_SQL in
        // order.repository.js) rather than being quietly reported as a
        // success.
        let unmatched = null;
        let confirmed = order.rows[0] ?? null;

        if (!confirmed) {
          const { rows } = await client.query(
            `SELECT status, order_number FROM orders WHERE id = $1::uuid FOR UPDATE`,
            [payment.order_id],
          );

          const lapsedDraft =
            rows[0]?.status === ORDER_STATUS.CANCELLED && !rows[0]?.order_number;

          // The hold ran out while the money was on its way. Place the
          // order after all if its pieces are still on the shelf.
          if (lapsedDraft) {
            confirmed = await reviveLapsedDraft(client, payment.order_id);
          }

          if (!confirmed && rows[0]?.status === ORDER_STATUS.CANCELLED) {
            // "lapsed": the checkout timed out and a piece sold before the
            // money arrived. "cancelled": a placed order a person cancelled.
            unmatched = lapsedDraft ? "lapsed" : "cancelled";

            // A cancelled order carrying `paid` is exactly what refund-due
            // means; recordRefund moves it on once the money goes back.
            // Numbered, so that a lapsed draft somebody paid for shows up
            // on the admin queue and in the shopper's history — money the
            // shop owes back must never sit on a row no screen lists.
            await client.query(
              `UPDATE orders
               SET payment_status = $2,
                   paid_at = COALESCE(paid_at, NOW()),
                   order_number = ${ASSIGN_ORDER_NUMBER_SQL},
                   updated_at = NOW()
               WHERE id = $1::uuid
                 AND payment_status = $3`,
              [payment.order_id, PAYMENT_STATUS.PAID, PAYMENT_STATUS.PENDING],
            );
          } else if (!confirmed) {
            unmatched = "duplicate";
          }
        }

        logger.info("Payment settled", {
          paymentId,
          orderId: payment.order_id,
          providerPaymentId,
          orderConfirmed: Boolean(confirmed),
          unmatched,
        });

        // The one moment in this codebase when an order becomes paid,
        // whichever of the two racing paths — the checkout return or the
        // webhook — arrived first.
        //
        // Emitted from here rather than from the service because the
        // service is reached twice and this guarded UPDATE applies once:
        // `WHERE status = 'pending_payment'` is already the exactly-once
        // gate, and piggybacking on it costs nothing and needs no second
        // lock. `alreadyPaid === false` would NOT have been the right
        // signal — it is also false when an admin had already confirmed
        // the order by hand, and had already been told.
        //
        // Inside the transaction, so that the confirmation and the
        // promise to announce it commit together. emitTx cannot throw
        // and cannot reach the network; see notification.service.js.
        let notificationIds = [];
        let emailIds = [];

        if (confirmed) {
          const { rows: counts } = await client.query(
            `SELECT COALESCE(SUM(quantity), 0)::int AS units
               FROM order_items
              WHERE order_id = $1::uuid`,
            [confirmed.id],
          );

          notificationIds = await NotificationService.emitTx(
            client,
            confirmed,
            NOTIFY_EVENT.ORDER_PAID,
            { unitCount: counts[0]?.units ?? null },
          );

          // Order confirmation to the shopper, new-order alert to the shop.
          emailIds = await EmailService.emitTx(client, confirmed, NOTIFY_EVENT.ORDER_PAID);
        }

        return {
          payment,
          order: confirmed,
          alreadyPaid: false,
          unmatched,
          notificationIds,
          emailIds,
        };
      });

      // After the commit, never inside it. A send that began before the
      // transaction landed would read an order still marked as awaiting
      // payment — and if the transaction then rolled back, it would have
      // told a shopper about a confirmation that never happened.
      //
      // Detached and non-throwing, so a WhatsApp cannot fail a payment
      // that has already been banked.
      NotificationService.dispatch(result.notificationIds);
      EmailService.dispatch(result.emailIds);

      if (result.unmatched) {
        // Somebody has to refund this by hand, so it must reach a person
        // and not only the log.
        logger.error("Payment captured against an order that was not awaiting it", {
          paymentId,
          orderId: result.payment?.order_id,
          providerPaymentId,
          reason: result.unmatched,
        });

        Sentry.captureMessage("Payment needs a refund", {
          level: "error",
          tags: { feature: "payments", reason: result.unmatched },
          extra: { paymentId, orderId: result.payment?.order_id, providerPaymentId },
        });
      }

      return result;
    } catch (error) {
      throw handleDatabaseError(error, "settle", { paymentId });
    }
  },

  // ==========================================================
  // FAIL
  // ==========================================================

  /**
   * Records that an attempt failed.
   *
   * The *order* is untouched on purpose. A declined card leaves the
   * checkout exactly where it was — `pending_payment`, with its stock
   * still held — so the shopper can try again with another method
   * without losing the last piece in their size to somebody else in the
   * meantime. The hold still runs out on time (CHECKOUT_HOLD_MINUTES).
   */
  async markFailed(paymentId, { providerPaymentId = null, code = null, description = null }) {
    const text = `
      UPDATE payments
      SET status = $2,
          provider_payment_id = COALESCE($3, provider_payment_id),
          error_code = $4,
          error_description = $5,
          updated_at = NOW()
      WHERE id = $1::uuid
        AND status = $6
      RETURNING ${COLUMNS}
    `;

    try {
      const result = await query(text, [
        paymentId,
        PAYMENT_ATTEMPT_STATUS.FAILED,
        providerPaymentId,
        code,
        description,
        PAYMENT_ATTEMPT_STATUS.CREATED,
      ]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "markFailed", { paymentId });
    }
  },

  // ==========================================================
  // REFUND
  // ==========================================================

  /**
   * Records one refund against a payment, and moves the payment and its
   * order to match what has now been refunded in total.
   *
   * Called for every refund.processed webhook. Each refund is a row in
   * payment_refunds keyed by Razorpay's refund id, so a redelivered
   * webhook finds its row already there and changes nothing. The totals
   * are then re-added from those rows rather than incremented, so they
   * cannot drift.
   *
   *   refunds < amount paid   payment stays `paid`; order becomes
   *                           `partially_refunded`
   *   refunds >= amount paid  payment `refunded`; order `refunded`
   *
   * Only when this is the order's only standing payment. Refunding the
   * duplicate of a double payment must leave the order reading `paid`:
   * the other payment still stands, and the shop kept that money.
   *
   * @param {string} paymentId
   * @param {{ providerRefundId: string, amount: number|null }} refund
   *        amount in rupees; null (an entity without one) means in full
   * @returns {Promise<{ payment: object|null, alreadyRecorded: boolean, refundedTotal?: number }>}
   */
  async recordRefund(paymentId, { providerRefundId, amount = null }) {
    try {
      return await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT ${COLUMNS} FROM payments WHERE id = $1::uuid FOR UPDATE`,
          [paymentId],
        );
        const payment = locked.rows[0];

        if (!payment) return { payment: null, alreadyRecorded: false };

        const paid = Number(payment.amount);
        const refundAmount = amount === null ? paid : Math.min(Number(amount), paid);

        const inserted = await client.query(
          `INSERT INTO payment_refunds (payment_id, provider, provider_refund_id, amount)
           VALUES ($1::uuid, $2, $3, $4)
           ON CONFLICT (provider, provider_refund_id) DO NOTHING
           RETURNING id`,
          [paymentId, payment.provider, providerRefundId, refundAmount],
        );

        if (inserted.rowCount === 0) {
          return { payment, alreadyRecorded: true };
        }

        const { rows: totals } = await client.query(
          `SELECT COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS refunded
             FROM payment_refunds WHERE payment_id = $1::uuid`,
          [paymentId],
        );
        const refundedTotal = Math.min(Number(totals[0].refunded), paid);
        const fullyRefunded = refundedTotal >= paid;

        let updated = payment;

        if (fullyRefunded) {
          const result = await client.query(
            `UPDATE payments
                SET status = $2, updated_at = NOW()
              WHERE id = $1::uuid AND status = $3
              RETURNING ${COLUMNS}`,
            [paymentId, PAYMENT_ATTEMPT_STATUS.REFUNDED, PAYMENT_ATTEMPT_STATUS.PAID],
          );
          updated = result.rows[0] ?? payment;
        }

        // The order follows only when no other payment on it still stands.
        const orderResult = await client.query(
          `UPDATE orders
              SET refunded_amount = LEAST($2::numeric, total),
                  payment_status = $3,
                  updated_at = NOW()
            WHERE id = $1::uuid
              AND payment_status IN ($4, $5)
              AND NOT EXISTS (
                SELECT 1 FROM payments p
                 WHERE p.order_id = $1::uuid
                   AND p.status = $6
                   AND p.id <> $7::uuid
              )
            RETURNING id`,
          [
            payment.order_id,
            refundedTotal,
            fullyRefunded ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
            PAYMENT_STATUS.PAID,
            PAYMENT_STATUS.PARTIALLY_REFUNDED,
            PAYMENT_ATTEMPT_STATUS.PAID,
            paymentId,
          ],
        );

        logger.info(fullyRefunded ? "Payment refunded" : "Payment partially refunded", {
          paymentId,
          orderId: payment.order_id,
          providerRefundId,
          refundAmount,
          refundedTotal,
          orderUpdated: orderResult.rowCount > 0,
        });

        return { payment: updated, alreadyRecorded: false, refundedTotal };
      });
    } catch (error) {
      throw handleDatabaseError(error, "recordRefund", { paymentId, providerRefundId });
    }
  },
};
