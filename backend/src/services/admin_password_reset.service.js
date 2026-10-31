// src/services/admin_password_reset.service.js
//
// "Forgot password" for the admin panel. The shopper flow in
// password_reset.service.js with the same two rules —
//
//   1. The request answers identically whether or not the email is an
//      admin's, and the email is sent detached so the response time
//      says nothing either. An admin login page that confirmed which
//      addresses are staff would be a gift to a phisher.
//
//   2. A successful reset ends every admin session on the account.
//
// — and three more, because an admin account reaches every order,
// refund and customer:
//
//   3. The link lives 15 minutes, not 30.
//   4. A disabled or deleted admin is sent nothing, and a link issued
//      before the account was disabled no longer works.
//   5. After the reset, a "your password was changed" email goes to the
//      same address, so a reset the owner did not make does not go
//      unnoticed.

import { randomBytes } from "node:crypto";

import bcrypt from "bcrypt";

import { hashToken, REVOKE_REASON } from "../config/auth.policy.js";
import { env } from "../config/env.js";
import {
  ADMIN_PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_COOLDOWN_SECONDS,
} from "../config/email.policy.js";
import { adminPasswordChangedEmail, adminPasswordResetEmail } from "../emails/templates.js";
import { clearAdminAccountLockout } from "../middlewares/rateLimiter.js";
import { AdminRepository } from "../repository/admin.repository.js";
import { AdminPasswordResetRepository } from "../repository/admin_password_reset.repository.js";
import { RefreshTokenRepository } from "../repository/refresh_token.repository.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { ADMIN_TOKEN_TYPE } from "./admin.auth.service.js";
import { EmailService, maskEmail } from "./email.service.js";

/** Matches the cost every other admin password is hashed at. */
const BCRYPT_COST = 12;

/** Read by the controller so the two can never drift apart. */
export const ADMIN_RESET_REQUESTED_MESSAGE =
  "If that email belongs to an admin account, we have sent a link to reset the password. It expires in " +
  `${ADMIN_PASSWORD_RESET_TTL_MINUTES} minutes.`;

/** Find the admin, mint a token, send the email. Never throws. */
async function issueAndSend(email, { ip }) {
  try {
    const admin = await AdminRepository.findByEmailForAuth(email);

    if (!admin || !admin.active) {
      logger.info("Admin password reset requested for an unknown or disabled account", {
        matchedAdmin: Boolean(admin),
      });
      return;
    }

    // 32 random bytes, URL-safe. Only its hash is stored.
    const token = randomBytes(32).toString("base64url");

    const issued = await AdminPasswordResetRepository.create({
      adminId: admin.id,
      tokenHash: hashToken(token),
      ttlMinutes: ADMIN_PASSWORD_RESET_TTL_MINUTES,
      cooldownSeconds: PASSWORD_RESET_COOLDOWN_SECONDS,
      ip,
    });

    if (!issued) {
      logger.info("Admin password reset ignored: requested again inside the cooldown", {
        adminId: admin.id,
      });
      return;
    }

    const resetUrl = `${env.email.storefrontUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;

    const { subject, html, text } = adminPasswordResetEmail({
      name: admin.name,
      resetUrl,
      ttlMinutes: ADMIN_PASSWORD_RESET_TTL_MINUTES,
    });

    await EmailService.sendNow({ to: admin.email, subject, html, text });

    logger.info("Admin password reset email sent", {
      adminId: admin.id,
      to: maskEmail(admin.email),
    });
  } catch (error) {
    // Logged, never surfaced: the response was already the same either way.
    logger.error("Admin password reset email could not be sent", error, {
      code: error?.code,
    });
  }
}

/** The "your password was changed" notice. Never throws. */
async function sendChangedNotice(admin, { ip }) {
  try {
    const { subject, html, text } = adminPasswordChangedEmail({
      name: admin.name,
      changedAt: new Date(),
      ip,
    });

    await EmailService.sendNow({ to: admin.email, subject, html, text });

    logger.info("Admin password changed notice sent", {
      adminId: admin.id,
      to: maskEmail(admin.email),
    });
  } catch (error) {
    logger.error("Admin password changed notice could not be sent", error, {
      adminId: admin.id,
      code: error?.code,
    });
  }
}

export const AdminPasswordResetService = {
  /**
   * Start a reset. Resolves immediately; the work runs detached so the
   * response time says nothing about whether the account exists.
   */
  async requestReset(email, { ip = null } = {}) {
    if (!env.email.enabled) {
      // Nobody can reset, whoever they are, so saying so leaks nothing.
      throw ApiError.serviceUnavailable(
        "Password reset is not available right now. Ask the shop owner to reset it for you.",
        "EMAIL_NOT_CONFIGURED",
      );
    }

    issueAndSend(email, { ip }).catch(() => {});
  },

  /**
   * Finish a reset: check the token, set the password, end every
   * session, lift the sign-in lockout, and tell the owner.
   */
  async resetPassword(token, newPassword, { ip = null } = {}) {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

    const admin = await AdminPasswordResetRepository.consume(hashToken(token), hashedPassword);

    if (!admin) {
      throw ApiError.badRequest(
        "This reset link has expired or has already been used. Please ask for a new one.",
        "RESET_TOKEN_INVALID",
      );
    }

    try {
      const revoked = await RefreshTokenRepository.revokeAllForSubject(
        admin.id,
        ADMIN_TOKEN_TYPE,
        REVOKE_REASON.PASSWORD_RESET,
      );

      logger.info("Admin password reset", { adminId: admin.id, sessionsRevoked: revoked });
    } catch (error) {
      // The password has changed, which is what was asked for, so this
      // does not fail the request — but old sessions now live until they
      // expire, which is worth an error in the log.
      logger.error("Admin password reset: could not revoke old sessions", error, {
        adminId: admin.id,
      });
    }

    await clearAdminAccountLockout(admin.email);

    sendChangedNotice(admin, { ip }).catch(() => {});
  },
};
