// src/repository/password_reset.repository.js
//
// The `password_reset_tokens` table.
//
// Only hashes are stored and looked up — the token itself exists in the
// email and nowhere else. `consume` burns the token and sets the new
// password in one transaction, so a link can never be used twice and a
// burned link always means the password did change.

import { withTransaction } from "../config/db.js";
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
   * Store a new token and burn every older unused one, so only the most
   * recent email's link works — unless this account already asked within
   * the cooldown, in which case nothing is written.
   *
   * Every clock question here is answered by the database. `created_at` is
   * stamped by the database, whose clock runs ~2 s ahead of the API
   * host, so the old "Date.now() - created_at" cooldown and the
   * "Date.now() + TTL" expiry were each off by the skew — and the expiry
   * was then compared against NOW() in `consume`, mixing the two clocks
   * in one rule.
   *
   * The cooldown check and the insert share a transaction, serialised on
   * the customer row, so two requests a millisecond apart cannot both
   * pass the check and both send an email.
   *
   * @param {object} params
   * @param {number} params.ttlMinutes        link lifetime
   * @param {number} params.cooldownSeconds   minimum gap between links
   * @returns {Promise<boolean>} false when refused by the cooldown
   */
  async create({ customerId, tokenHash, ttlMinutes, cooldownSeconds, ip = null }) {
    try {
      return await withTransaction(async (client) => {
        // Serialises concurrent requests for this account. (Postgres used
        // FOR NO KEY UPDATE so FK checks from an order or address insert
        // were not blocked; InnoDB has no such mode, so those wait for
        // this short transaction.)
        await client.query(
          `SELECT 1 FROM customers WHERE id = $1 FOR UPDATE`,
          [customerId],
        );

        const recent = await client.query(
          `SELECT 1
             FROM password_reset_tokens
            WHERE customer_id = $1
              AND created_at > NOW(6) - INTERVAL $2 SECOND
            LIMIT 1`,
          [customerId, Number(cooldownSeconds)],
        );

        if (recent.rowCount > 0) return false;

        await client.query(
          `UPDATE password_reset_tokens
              SET used_at = NOW(6)
            WHERE customer_id = $1
              AND used_at IS NULL`,
          [customerId],
        );

        await client.query(
          `INSERT INTO password_reset_tokens (customer_id, token_hash, expires_at, requested_ip)
           VALUES ($1, $2, NOW(6) + INTERVAL $3 MINUTE, $4)`,
          [customerId, tokenHash, Math.round(Number(ttlMinutes)), ip ? String(ip).slice(0, 64) : null],
        );

        return true;
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
        // The claim. Postgres did it in one UPDATE … RETURNING, which
        // MariaDB lacks: the locking read holds the token row, so a second
        // concurrent consume waits here and then no longer sees it as
        // unused; the guarded UPDATE re-checks that anyway.
        const claimed = await client.query(
          `SELECT id, customer_id
             FROM password_reset_tokens
            WHERE token_hash = $1
              AND used_at IS NULL
              AND expires_at > NOW(6)
            FOR UPDATE`,
          [tokenHash],
        );

        if (claimed.rowCount === 0) return null;

        const burned = await client.query(
          `UPDATE password_reset_tokens
              SET used_at = NOW(6)
            WHERE id = $1
              AND used_at IS NULL`,
          [claimed.rows[0].id],
        );

        if (burned.rowCount !== 1) return null;

        const customerId = claimed.rows[0].customer_id;

        const updated = await client.query(
          `UPDATE customers
              SET password = $1,
                  updated_at = NOW(6)
            WHERE id = $2
              AND deleted_at IS NULL`,
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
