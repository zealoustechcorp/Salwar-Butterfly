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
   * Records that a payment sheet was opened.
   *
   * Written *before* the shopper sees the sheet, not after they pay. An
   * attempt that is created and abandoned is the normal case and is
   * worth having: without this row, a webhook for a payment we never
   * recorded has nothing to attach to.
   */
  async create({
    orderId,
    provider = DEFAULT_PROVIDER,
    providerOrderId,
    amount,
    currency,
  }) {
    const text = `
      INSERT INTO payments (
        order_id, provider, provider_order_id, status, amount, currency
      )
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      RETURNING ${COLUMNS}
    `;

    try {
      const result = await query(text, [
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
   */
  async settle(paymentId, { providerPaymentId, method = null }) {
    try {
      return await withTransaction(async (client) => {
        const paid = await client.query(
          `UPDATE payments
           SET status = $2,
               provider_payment_id = $3,
               method = COALESCE($4, method),
               paid_at = COALESCE(paid_at, NOW()),
               updated_at = NOW()
           WHERE id = $1::uuid
             AND status = $5
           RETURNING ${COLUMNS}`,
          [
            paymentId,
            PAYMENT_ATTEMPT_STATUS.PAID,
            providerPaymentId,
            method,
            PAYMENT_ATTEMPT_STATUS.CREATED,
          ],
        );

        if (paid.rowCount === 0) {
          return { payment: null, order: null, alreadyPaid: true };
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

        return {
          payment,
          order: order.rows[0] ?? null,
          alreadyPaid: false,
        };
      });
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
