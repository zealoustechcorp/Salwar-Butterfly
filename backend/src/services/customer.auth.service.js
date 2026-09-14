// src/services/customer.auth.service.js

import bcrypt from "bcrypt";

import { CustomerRepository } from "../repository/customer.repository.js";
import { CustomerService } from "./customer.service.js";
import { CustomerMapper } from "../mapper/customer.mapper.js";
import { LoginCustomerDTO } from "../dto/customer.dto.js";
import { SessionService } from "./session.service.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// ============================================================
// CONSTANTS
// ============================================================

const BCRYPT_COST = 12;

/**
 * Token audience marker (F-01.02).
 *
 * The counterpart to ADMIN_TOKEN_TYPE, and the reason both can share
 * one JWT secret safely: `requireAdmin` refuses a token whose `typ` is
 * not "admin", so a shopper's token verifies perfectly and still gets
 * a 403 on an admin route. Signature valid, audience wrong.
 */
export const CUSTOMER_TOKEN_TYPE = "customer";

/**
 * The role a customer token carries.
 *
 * Customers have no role hierarchy — there is one kind of shopper —
 * but the claim is present so `req.user.role` means the same thing
 * whichever token populated it.
 */
export const CUSTOMER_ROLE = "customer";

/**
 * A throwaway hash compared against when no customer matches the
 * submitted email.
 *
 * Without it an unknown address returns in ~1ms while a known one
 * spends ~250ms in bcrypt — a gap wide enough to enumerate which email
 * addresses have accounts with this shop, which is itself worth
 * protecting. Same reasoning, and same cost factor, as the admin side.
 */
const TIMING_DECOY_HASH = bcrypt.hashSync(
  `decoy:${Math.random()}:${Date.now()}`,
  BCRYPT_COST,
);

/**
 * One message for every failure below. Separating "no such account"
 * from "wrong password" would answer "does this person shop here?"
 * for anyone who asks.
 */
const INVALID_CREDENTIALS = "Invalid email or password";

// ============================================================
// SERVICE
// ============================================================

export const CustomerAuthService = Object.freeze({
  // ==========================================================
  // LOGIN
  // ==========================================================

  async login(email, password, { userAgent, ip } = {}) {
    const dto = new LoginCustomerDTO(email, password);

    let customer = null;

    try {
      customer = await CustomerRepository.findByEmailForAuth(dto.email);
    } catch (error) {
      if (error?.code === "DATABASE_UNAVAILABLE") {
        throw ApiError.serviceUnavailable(
          "Service temporarily unavailable. Please try again.",
          "DATABASE_UNAVAILABLE",
        );
      }

      logger.error("Customer login repository failure", {
        code: error?.code,
        message: error?.message,
      });

      throw ApiError.internal("Unable to sign in right now");
    }

    // --------------------------------------------------------
    // VERIFY PASSWORD
    // --------------------------------------------------------
    //
    // bcrypt.compare runs even when no row came back, so both
    // branches cost the same wall-clock time.
    //
    // --------------------------------------------------------

    const passwordMatches = await bcrypt.compare(
      dto.password,
      customer?.password ?? TIMING_DECOY_HASH,
    );

    if (!customer || !passwordMatches) {
      logger.warn("Customer login failed: invalid credentials", {
        // The submitted address stays out of the log. A failed login
        // is exactly where a password gets mistyped into the email
        // field, and these files are kept on disk.
        matchedCustomer: Boolean(customer),
      });

      throw ApiError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
    }

    // A soft-deleted account cannot reach here: findByEmailForAuth
    // filters on deleted_at IS NULL, so closing an account ends the
    // ability to sign in immediately.

    const session = await SessionService.open({
      subjectId: customer.id,
      typ: CUSTOMER_TOKEN_TYPE,
      claims: { email: customer.email, role: CUSTOMER_ROLE },
      userAgent,
      ip,
    });

    logger.info("Customer login succeeded", {
      customerId: customer.id,
    });

    return {
      customer: CustomerMapper.toAuthDTO(customer),
      session,
    };
  },

  // ==========================================================
  // REFRESH
  // ==========================================================
  //
  // The storefront's mirror of the admin flow. The account is re-read
  // on the way through, so an account closed from the admin panel stops
  // being able to renew — the same guarantee `getCurrentCustomer`
  // already gives on /me, applied to the one call that extends a
  // session rather than merely reading it.
  //
  // ==========================================================

  async refresh({ token, userAgent, ip }) {
    return SessionService.renew({
      token,
      typ: CUSTOMER_TOKEN_TYPE,
      userAgent,
      ip,

      loadSubject: async (customerId) => {
        // findById filters on deleted_at IS NULL, so a closed account
        // comes back null and the family is revoked.
        const customer = await CustomerRepository.findById(customerId);

        if (!customer) return null;

        return { email: customer.email, role: CUSTOMER_ROLE };
      },
    });
  },

  // ==========================================================
  // LOGOUT
  // ==========================================================

  async logout(refreshToken) {
    return SessionService.close({
      token: refreshToken,
      typ: CUSTOMER_TOKEN_TYPE,
    });
  },

  // ==========================================================
  // CURRENT CUSTOMER
  // ==========================================================
  //
  // Re-reads the row on every call rather than trusting the token
  // body, so an account closed from the admin panel stops working
  // at once instead of when its token happens to expire.
  //
  // ==========================================================

  async getCurrentCustomer(customerId) {
    const customer = await CustomerRepository.findById(customerId);

    if (!customer) {
      throw ApiError.unauthorized(
        "Your session is no longer valid",
        "SESSION_INVALID",
      );
    }

    return CustomerMapper.toDTO(customer);
  },

  // ==========================================================
  // UPDATE OWN PROFILE
  // ==========================================================

  /**
   * The shopper editing their own name, email or phone (F-05.06).
   *
   * Delegates to CustomerService rather than reimplementing: the
   * uniqueness rules on email and phone are the same rules whoever is
   * doing the editing, and a second copy of them is a second place for
   * them to drift.
   *
   * `password` is deliberately not reachable here — changing it needs
   * the current one, which is a different endpoint with a different
   * guard.
   */
  async updateOwnProfile(customerId, { name, email, phone }) {
    if (name === undefined && email === undefined && phone === undefined) {
      throw ApiError.badRequest(
        "At least one field is required to update",
        "VALIDATION_ERROR",
      );
    }

    return CustomerService.updateCustomer(customerId, name, email, phone);
  },
});
