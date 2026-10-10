// src/services/password_reset.service.js
//
// "Forgot password" for shoppers.
//
// Two rules shape everything here:
//
//   1. The request endpoint answers identically whether or not the email
//      has an account. Anything else — a different message, a different
//      status, a slower response — tells a stranger who shops here. The
//      email is therefore sent detached, after the response is decided.
//
//   2. A successful reset ends every session the account has. Whoever
//      knew the old password may be signed in somewhere; resetting it is
//      the moment to throw them out.

import { randomBytes } from "node:crypto";

import bcrypt from "bcrypt";

import { hashToken, REVOKE_REASON } from "../config/auth.policy.js";
import { env } from "../config/env.js";
import {
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MINUTES,
} from "../config/email.policy.js";
import { passwordResetEmail } from "../emails/templates.js";
import { CustomerRepository } from "../repository/customer.repository.js";
import { PasswordResetRepository } from "../repository/password_reset.repository.js";
import { RefreshTokenRepository } from "../repository/refresh_token.repository.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { EmailService, maskEmail } from "./email.service.js";
import { CUSTOMER_TOKEN_TYPE } from "./customer.auth.service.js";

/** Matches the cost every other customer password is hashed at. */
const BCRYPT_COST = 12;

/** Read by the controller so the two can never drift apart. */
export const RESET_REQUESTED_MESSAGE =
  "If an account exists for that email, we have sent a link to reset the password. It expires in " +
  `${PASSWORD_RESET_TTL_MINUTES} minutes.`;

/** Find the account, mint a token, send the email. Never throws. */
async function issueAndSend(email, { ip }) {
  try {
    const customer = await CustomerRepository.findByEmail(email);

    if (!customer) {
      logger.info("Password reset requested for an unknown email");
      return;
    }

    const last = await PasswordResetRepository.lastRequestedAt(customer.id);

    if (last && Date.now() - new Date(last).getTime() < PASSWORD_RESET_COOLDOWN_SECONDS * 1000) {
      logger.info("Password reset ignored: requested again inside the cooldown", {
        customerId: customer.id,
      });
      return;
    }

    // 32 random bytes, URL-safe. Only its hash is stored.
    const token = randomBytes(32).toString("base64url");

    await PasswordResetRepository.create({
      customerId: customer.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      ip,
    });

    const resetUrl = `${env.email.storefrontUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const { subject, html, text } = passwordResetEmail({
      name: customer.name,
      resetUrl,
      ttlMinutes: PASSWORD_RESET_TTL_MINUTES,
    });

    await EmailService.sendNow({ to: customer.email, subject, html, text });

    logger.info("Password reset email sent", {
      customerId: customer.id,
      to: maskEmail(customer.email),
    });
  } catch (error) {
    // Logged, never surfaced: the response was already the same either way.
    logger.error("Password reset email could not be sent", error, {
      code: error?.code,
    });
  }
}

export const PasswordResetService = {
  /**
   * Start a reset. Resolves immediately; the work runs detached so the
   * response time says nothing about whether the account exists.
   */
  async requestReset(email, { ip = null } = {}) {
    if (!env.email.enabled) {
      // The one case that is honest to report: nobody can reset, whoever
      // they are, so saying so leaks nothing about any account.
      throw ApiError.serviceUnavailable(
        "Password reset is not available right now. Please contact the shop.",
        "EMAIL_NOT_CONFIGURED",
      );
    }

    issueAndSend(email, { ip }).catch(() => {});
  },

  /**
   * Finish a reset: check the token, set the password, end every session.
   */
  async resetPassword(token, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

    const customerId = await PasswordResetRepository.consume(hashToken(token), hashedPassword);

    if (!customerId) {
      throw ApiError.badRequest(
        "This reset link has expired or has already been used. Please ask for a new one.",
        "RESET_TOKEN_INVALID",
      );
    }

    try {
      const revoked = await RefreshTokenRepository.revokeAllForSubject(
        customerId,
        CUSTOMER_TOKEN_TYPE,
        REVOKE_REASON.PASSWORD_RESET,
      );

      logger.info("Customer password reset", { customerId, sessionsRevoked: revoked });
    } catch (error) {
      // The password has changed, which is what the shopper asked for,
      // so this does not fail the request. Old sessions survive until
      // they expire, though, which is worth an error in the log.
      logger.error("Password reset: could not revoke old sessions", error, { customerId });
    }
  },
};
