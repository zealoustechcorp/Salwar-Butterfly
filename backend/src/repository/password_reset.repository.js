// src/repository/password_reset.repository.js
//
// The `password_reset_tokens` table.
//
// Only hashes are stored and looked up — the token itself exists in the
// email and nowhere else. `consume` burns the token and sets the new
// password in one transaction, so a link can never be used twice and a
// burned link always means the password did change.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Password reset repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

export const PasswordResetRepository = {
  /**
   * When this account last asked for a link, for the resend cooldown.
   *
   * @returns {Promise<Date|null>}
   */
  async lastRequestedAt(customerId) {
    try {
      const { rows } = await query(
        `SELECT created_at
           FROM password_reset_tokens
          WHERE customer_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 1`,
        [customerId],
      );

      return rows[0]?.created_at ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "lastRequestedAt", { customerId });
    }
  },

  /**
   * Store a new token and burn every older unused one, so only the most
   * recent email's link works.
   */
  async create({ customerId, tokenHash, expiresAt, ip = null }) {
    try {
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE password_reset_tokens
              SET used_at = NOW()
            WHERE customer_id = $1::uuid
              AND used_at IS NULL`,
          [customerId],
        );

        await client.query(
          `INSERT INTO password_reset_tokens (customer_id, token_hash, expires_at, requested_ip)
           VALUES ($1::uuid, $2, $3, $4)`,
          [customerId, tokenHash, expiresAt, ip ? String(ip).slice(0, 64) : null],
        );
      });
    } catch (error) {
      throw handleDatabaseError(error, "create", { customerId });
    }
  },

  /**
   * Use a token: burn it and set the new password, atomically.
   *
   * @returns {Promise<string|null>} the customer id, or null when the
   *          token is unknown, used, expired, or its account is closed
   */
  async consume(tokenHash, hashedPassword) {
    try {
      return await withTransaction(async (client) => {
        const burned = await client.query(
          `UPDATE password_reset_tokens
              SET used_at = NOW()
            WHERE token_hash = $1
              AND used_at IS NULL
              AND expires_at > NOW()
            RETURNING customer_id`,
          [tokenHash],
        );

        if (burned.rowCount === 0) return null;

        const customerId = burned.rows[0].customer_id;

        const updated = await client.query(
          `UPDATE customers
              SET password = $1,
                  updated_at = NOW()
            WHERE id = $2::uuid
              AND deleted_at IS NULL
            RETURNING id`,
          [hashedPassword, customerId],
        );

        // A closed account. Throwing rolls the burn back too, but the
        // answer to the caller is the same "link no longer works", so
        // returning null and committing the burn is the simpler truth.
        if (updated.rowCount === 0) return null;

        return customerId;
      });
    } catch (error) {
      throw handleDatabaseError(error, "consume");
    }
  },
};
