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

import { withTransaction, query } from "../config/db.js";
import { logger } from "../utils/logger.js";
import {
  DEFAULT_PROVIDER,
  PAYMENT_ATTEMPT_STATUS,
} from "../config/payment.policy.js";
import { ORDER_STATUS, PAYMENT_STATUS } from "../config/order.policy.js";
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
   * The newest attempt on this order that is still open.
   *
   * "Open" means `created`: a sheet was opened and nothing has settled
   * or failed it. A `failed` row must never come back from here — the
   * shopper whose card was declined is trying again, and handing them
   * the sheet that just refused them is the one outcome worse than
   * making a new one. `paid` cannot appear either, because the order
   * would no longer be awaiting payment.
   *
   * Reads on `idx_payments_order_created`, which already orders by
   * `created_at DESC` for the admin page.
   */
  async findLatestOpenAttempt(
    orderId,
    { client = null, provider = DEFAULT_PROVIDER } = {},
  ) {
    const text = `
      SELECT ${COLUMNS}
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

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findLatestOpenAttempt", { orderId });
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
   * An order that is already `confirmed` when a payment settles is not a
   * conflict — an admin may have confirmed a transfer by hand moments
   * before the gateway callback landed. The attempt is still marked paid;
   * only the order UPDATE finds nothing to do.
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

        const order = await client.query(
          `UPDATE orders
           SET status = $2,
               payment_status = $3,
               paid_at = COALESCE(paid_at, NOW()),
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

        logger.info("Payment settled", {
          paymentId,
          orderId: payment.order_id,
          providerPaymentId,
          orderConfirmed: order.rowCount > 0,
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

        if (order.rowCount > 0) {
          const confirmed = order.rows[0];

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
          order: order.rows[0] ?? null,
          alreadyPaid: false,
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
   * order exactly where it was — `pending_payment`, with its stock still
   * reserved — so the shopper can try again with another method without
   * losing the last piece in their size to somebody else in the
   * meantime. Only a cancellation puts stock back.
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
   * Records that money went back.
   *
   * Guarded on `paid`, because refunding an attempt that never paid is
   * not a state — it is a bug somewhere upstream, and it should fail
   * loudly here rather than leave a row claiming a refund that no bank
   * ever made.
   *
   * `orders.payment_status` is moved with it, in the same transaction
   * and for the same reason `settle` does: the order's one-word answer
   * to "has this been paid for" must not survive the money leaving.
   * The order's *status* is left alone — whether a refunded order is
   * also cancelled is a decision the shop makes, and it has its own
   * route with its own stock consequences.
   */
  async markRefunded(paymentId) {
    try {
      return await withTransaction(async (client) => {
        const refunded = await client.query(
          `UPDATE payments
           SET status = $2,
               updated_at = NOW()
           WHERE id = $1::uuid
             AND status = $3
           RETURNING ${COLUMNS}`,
          [paymentId, PAYMENT_ATTEMPT_STATUS.REFUNDED, PAYMENT_ATTEMPT_STATUS.PAID],
        );

        if (refunded.rowCount === 0) {
          return { payment: null, alreadyRefunded: true };
        }

        const payment = refunded.rows[0];

        await client.query(
          `UPDATE orders
           SET payment_status = $2,
               updated_at = NOW()
           WHERE id = $1::uuid
             AND payment_status = $3`,
          [payment.order_id, PAYMENT_STATUS.REFUNDED, PAYMENT_STATUS.PAID],
        );

        logger.info("Payment refunded", {
          paymentId,
          orderId: payment.order_id,
        });

        return { payment, alreadyRefunded: false };
      });
    } catch (error) {
      throw handleDatabaseError(error, "markRefunded", { paymentId });
    }
  },
};
