// src/repository/email.repository.js
//
// The email outbox. The same shape as the WhatsApp half of
// notification.repository.js, for the same reasons: `emitTx` takes the
// caller's transaction client so the promise to send commits with the
// order change, and `claim` is guarded so the immediate dispatch and the
// sweeper never send one row twice.

import { query, withTransaction } from "../config/db.js";
import { EMAIL_STATUS } from "../config/email.policy.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Email repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

const COLUMNS = `
  id, dedupe_key, order_id, kind, audience, to_email, status, attempts,
  next_attempt_at, provider_message_id, error_code, error_detail,
  created_at, updated_at, sent_at, failed_at
`;

/** A row in `sending` this long is a process killed mid-send. */
const STUCK_AFTER = "10 minutes";

// Not frozen, matching the other repositories, so tests can mock.method it.
export const EmailRepository = {
  /**
   * Write outbox rows inside the caller's transaction.
   *
   * @param {import('pg').PoolClient} client
   * @param {Array<{dedupeKey, orderId, kind, audience, toEmail, status, errorCode}>} rows
   * @returns {Promise<string[]>} ids of the new rows that are waiting to send
   */
  async emitTx(client, rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const values = [];
    const placeholders = [];

    for (const [index, row] of rows.entries()) {
      const base = index * 7;

      placeholders.push(
        `($${base + 1}, $${base + 2}::uuid, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
      );

      values.push(
        row.dedupeKey,
        row.orderId,
        row.kind,
        row.audience,
        row.toEmail,
        row.status ?? EMAIL_STATUS.PENDING,
        row.errorCode ?? null,
      );
    }

    const { rows: created } = await client.query(
      `INSERT INTO email_messages
         (dedupe_key, order_id, kind, audience, to_email, status, error_code)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id, status`,
      values,
    );

    return created
      .filter((row) => row.status === EMAIL_STATUS.PENDING)
      .map((row) => row.id);
  },

  /** Take ownership of a row so nothing else sends it. */
  async claim(id, { backoffSeconds = 300 } = {}) {
    try {
      const { rows } = await query(
        `UPDATE email_messages
            SET status = $2,
                attempts = attempts + 1,
                next_attempt_at = NOW() + ($3 || ' seconds')::interval,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND status IN ($4, $5)
          RETURNING ${COLUMNS}`,
        [id, EMAIL_STATUS.SENDING, String(backoffSeconds), EMAIL_STATUS.PENDING, EMAIL_STATUS.SENDING],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "claim", { id });
    }
  },

  /** What is owed, oldest first. SKIP LOCKED so two instances split the work. */
  async findDue(limit = 25) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT id
             FROM email_messages
            WHERE (status = $1 AND next_attempt_at <= NOW())
               OR (status = $2 AND updated_at < NOW() - INTERVAL '${STUCK_AFTER}')
            ORDER BY created_at
            LIMIT $3
            FOR UPDATE SKIP LOCKED`,
          [EMAIL_STATUS.PENDING, EMAIL_STATUS.SENDING, limit],
        );

        return rows.map((row) => row.id);
      });
    } catch (error) {
      throw handleDatabaseError(error, "findDue", { limit });
    }
  },

  async markSent(id, { providerMessageId }) {
    try {
      const { rows } = await query(
        `UPDATE email_messages
            SET status = $2,
                provider_message_id = $3,
                error_code = NULL,
                error_detail = NULL,
                sent_at = COALESCE(sent_at, NOW()),
                updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING ${COLUMNS}`,
        [id, EMAIL_STATUS.SENT, providerMessageId],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "markSent", { id });
    }
  },

  /** `retryable` puts the row back to pending with a due time; otherwise it is failed for good. */
  async markAttemptFailed(id, { retryable, errorCode, errorDetail, backoffSeconds = 60 }) {
    try {
      const { rows } = await query(
        `UPDATE email_messages
            SET status = CASE WHEN $2 THEN $3 ELSE $4 END,
                next_attempt_at = CASE
                  WHEN $2 THEN NOW() + ($5 || ' seconds')::interval
                  ELSE next_attempt_at
                END,
                failed_at = CASE WHEN $2 THEN failed_at ELSE NOW() END,
                error_code = $6,
                error_detail = $7,
                updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING ${COLUMNS}`,
        [
          id,
          Boolean(retryable),
          EMAIL_STATUS.PENDING,
          EMAIL_STATUS.FAILED,
          String(backoffSeconds),
          errorCode ? String(errorCode).slice(0, 32) : null,
          errorDetail ? String(errorDetail).slice(0, 2000) : null,
        ],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "markAttemptFailed", { id });
    }
  },
};
