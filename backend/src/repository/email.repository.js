// src/repository/email.repository.js
//
// The email outbox. `emitTx` takes the caller's transaction client so
// the promise to send commits with the order change, and `claim` is
// guarded so the immediate dispatch and the sweeper never send one row
// twice.

import { withTransaction } from "../config/db.js";
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

/** A row in `sending` this many minutes is a process killed mid-send. */
const STUCK_AFTER_MINUTES = 10;

/**
 * Run an UPDATE of one row by id and read the row back, in one
 * transaction. MariaDB has no UPDATE … RETURNING; the UPDATE's row lock
 * is held until the SELECT has read what it wrote, so the pair is as
 * atomic as the single Postgres statement was. Null when no row matched.
 */
const updateOneReturning = (sql, params) =>
  withTransaction(async (client) => {
    const { rowCount } = await client.query(sql, params);
    if (rowCount === 0) return null;

    const { rows } = await client.query(
      `SELECT ${COLUMNS} FROM email_messages WHERE id = $1`,
      [params[0]],
    );
    return rows[0] ?? null;
  });

// Not frozen, matching the other repositories, so tests can mock.method it.
export const EmailRepository = {
  /**
   * Write outbox rows inside the caller's transaction.
   *
   * One INSERT per row: a dedupe_key that already exists is skipped
   * (as ON CONFLICT DO NOTHING did) by catching its unique violation —
   * in MariaDB a failed statement does not abort the transaction, and a
   * multi-row INSERT would fail as a whole on one duplicate.
   *
   * @param {import('pg').PoolClient} client
   * @param {Array<{dedupeKey, orderId, kind, audience, toEmail, status, errorCode}>} rows
   * @returns {Promise<string[]>} ids of the new rows that are waiting to send
   */
  async emitTx(client, rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const created = [];

    for (const row of rows) {
      try {
        const { rows: inserted } = await client.query(
          `INSERT INTO email_messages
             (dedupe_key, order_id, kind, audience, to_email, status, error_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, status`,
          [
            row.dedupeKey,
            row.orderId,
            row.kind,
            row.audience,
            row.toEmail,
            row.status ?? EMAIL_STATUS.PENDING,
            row.errorCode ?? null,
          ],
        );
        created.push(...inserted);
      } catch (error) {
        if (error?.code === "23505" && error?.constraint === "uq_email_messages_dedupe_key") continue;
        throw error;
      }
    }

    return created
      .filter((row) => row.status === EMAIL_STATUS.PENDING)
      .map((row) => row.id);
  },

  /** Take ownership of a row so nothing else sends it. */
  async claim(id, { backoffSeconds = 300 } = {}) {
    try {
      return await updateOneReturning(
        `UPDATE email_messages
            SET status = $2,
                attempts = attempts + 1,
                next_attempt_at = NOW(6) + INTERVAL $3 SECOND,
                updated_at = NOW(6)
          WHERE id = $1
            AND status IN ($4, $5)`,
        [id, EMAIL_STATUS.SENDING, Number(backoffSeconds), EMAIL_STATUS.PENDING, EMAIL_STATUS.SENDING],
      );
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
            WHERE (status = $1 AND next_attempt_at <= NOW(6))
               OR (status = $2 AND updated_at < NOW(6) - INTERVAL ${STUCK_AFTER_MINUTES} MINUTE)
            ORDER BY created_at
            LIMIT $3
            FOR UPDATE SKIP LOCKED`,
          [EMAIL_STATUS.PENDING, EMAIL_STATUS.SENDING, Number(limit)],
        );

        return rows.map((row) => row.id);
      });
    } catch (error) {
      throw handleDatabaseError(error, "findDue", { limit });
    }
  },

  async markSent(id, { providerMessageId }) {
    try {
      return await updateOneReturning(
        `UPDATE email_messages
            SET status = $2,
                provider_message_id = $3,
                error_code = NULL,
                error_detail = NULL,
                sent_at = COALESCE(sent_at, NOW(6)),
                updated_at = NOW(6)
          WHERE id = $1`,
        [id, EMAIL_STATUS.SENT, providerMessageId],
      );
    } catch (error) {
      throw handleDatabaseError(error, "markSent", { id });
    }
  },

  /** `retryable` puts the row back to pending with a due time; otherwise it is failed for good. */
  async markAttemptFailed(id, { retryable, errorCode, errorDetail, backoffSeconds = 60 }) {
    try {
      return await updateOneReturning(
        `UPDATE email_messages
            SET status = CASE WHEN $2 THEN $3 ELSE $4 END,
                next_attempt_at = CASE
                  WHEN $2 THEN NOW(6) + INTERVAL $5 SECOND
                  ELSE next_attempt_at
                END,
                failed_at = CASE WHEN $2 THEN failed_at ELSE NOW(6) END,
                error_code = $6,
                error_detail = $7,
                updated_at = NOW(6)
          WHERE id = $1`,
        [
          id,
          Boolean(retryable),
          EMAIL_STATUS.PENDING,
          EMAIL_STATUS.FAILED,
          Number(backoffSeconds),
          errorCode ? String(errorCode).slice(0, 32) : null,
          errorDetail ? String(errorDetail).slice(0, 2000) : null,
        ],
      );
    } catch (error) {
      throw handleDatabaseError(error, "markAttemptFailed", { id });
    }
  },
};
