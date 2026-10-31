// src/repository/admin_password_reset.repository.js
//
// The `admin_password_reset_tokens` table — the admin twin of
// password_reset.repository.js, and deliberately the same rules.
//
// Only hashes are stored and looked up. `consume` burns the token and
// sets the new password in one transaction, so a link can never be used
// twice and a burned link always means the password did change.

import { withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Admin password reset repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

export const AdminPasswordResetRepository = {
  /**
   * Store a new token and burn every older unused one, so only the most
   * recent email's link works — unless this admin already asked within
   * the cooldown, in which case nothing is written.
   *
   * Every clock question is answered by Postgres, and the cooldown check
   * and the insert share a transaction serialised on the admin row — see
   * PasswordResetRepository.create for why.
   *
   * @returns {Promise<boolean>} false when refused by the cooldown
   */
  async create({ adminId, tokenHash, ttlMinutes, cooldownSeconds, ip = null }) {
    try {
      return await withTransaction(async (client) => {
        await client.query(
          `SELECT 1 FROM admins WHERE id = $1::uuid FOR NO KEY UPDATE`,
          [adminId],
        );

        const recent = await client.query(
          `SELECT 1
             FROM admin_password_reset_tokens
            WHERE admin_id = $1::uuid
              AND created_at > NOW() - make_interval(secs => $2::float8)
            LIMIT 1`,
          [adminId, cooldownSeconds],
        );

        if (recent.rowCount > 0) return false;

        await client.query(
          `UPDATE admin_password_reset_tokens
              SET used_at = NOW()
            WHERE admin_id = $1::uuid
              AND used_at IS NULL`,
          [adminId],
        );

        await client.query(
          `INSERT INTO admin_password_reset_tokens (admin_id, token_hash, expires_at, requested_ip)
           VALUES ($1::uuid, $2, NOW() + make_interval(mins => $3::int), $4)`,
          [adminId, tokenHash, ttlMinutes, ip ? String(ip).slice(0, 64) : null],
        );

        return true;
      });
    } catch (error) {
      throw handleDatabaseError(error, "create", { adminId });
    }
  },

  /**
   * Use a token: burn it and set the new password, atomically.
   *
   * An admin disabled or deleted after the email went out gets nothing:
   * the token is burned and the password is left alone.
   *
   * @returns {Promise<{id: string, name: string, email: string}|null>}
   *          the admin, or null when the token is unknown, used, expired,
   *          or its account may no longer sign in
   */
  async consume(tokenHash, hashedPassword) {
    try {
      return await withTransaction(async (client) => {
        const burned = await client.query(
          `UPDATE admin_password_reset_tokens
              SET used_at = NOW()
            WHERE token_hash = $1
              AND used_at IS NULL
              AND expires_at > NOW()
            RETURNING admin_id`,
          [tokenHash],
        );

        if (burned.rowCount === 0) return null;

        const updated = await client.query(
          `UPDATE admins
              SET password = $1,
                  password_changed_at = NOW(),
                  updated_at = NOW()
            WHERE id = $2::uuid
              AND deleted_at IS NULL
              AND active = TRUE
            RETURNING id, name, email`,
          [hashedPassword, burned.rows[0].admin_id],
        );

        // Same reasoning as the customer side: the caller's answer is
        // "link no longer works" either way, so commit the burn.
        return updated.rows[0] ?? null;
      });
    } catch (error) {
      throw handleDatabaseError(error, "consume");
    }
  },
};
