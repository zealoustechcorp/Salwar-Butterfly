// src/controllers/customer.auth.controller.js

import { CustomerAuthService } from "../services/customer.auth.service.js";
import { AUTH_AUDIENCE } from "../config/auth.policy.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../utils/sessionCookie.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const AUDIENCE = AUTH_AUDIENCE.CUSTOMER;

/**
 * The storefront's half of the same split the admin panel makes: access
 * token in the body for the page to hold in memory, refresh token in an
 * httpOnly cookie the page can never read.
 *
 * The two audiences use separately named, separately path-scoped
 * cookies, so a shop owner browsing their own storefront while signed
 * into the admin panel keeps two independent sessions rather than one
 * overwriting the other.
 */
const sendSession = (res, session) => {
  setRefreshCookie(res, AUDIENCE, session.refreshToken, session.refreshExpiresAt);

  return { accessToken: session.accessToken };
};

export const CustomerAuthController = {
  // ==========================================================
  // POST /api/customers/auth/login
  // ==========================================================

  login: asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await CustomerAuthService.login(email, password, {
        userAgent: req.get("user-agent"),
        ip: req.ip,
      });

      logger.info("Customer login request completed", {
        customerId: result.customer.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: {
          customer: result.customer,
          ...sendSession(res, result.session),
        },
        message: "Signed in successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer login controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to sign in");
    }
  }),

  // ==========================================================
  // GET /api/customers/auth/me
  // ==========================================================
  //
  // The storefront calls this on boot to turn a stored token back
  // into an identity, and to confirm the account behind it still
  // exists — an account closed from the admin panel must not keep
  // rendering a signed-in header until its token expires.
  //
  // ==========================================================

  me: asyncHandler(async (req, res) => {
    try {
      const customer = await CustomerAuthService.getCurrentCustomer(
        req.user.id,
      );

      return okResponse({
        res,
        data: { customer },
        message: "Customer retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer me controller error", {
        customerId: req.user?.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to load the current customer");
    }
  }),

  // ==========================================================
  // PUT /api/customers/auth/me
  // ==========================================================
  //
  // The shopper editing their own profile (F-05.02 / F-05.06).
  //
  // The id comes from the token, never from the body or the URL —
  // there is no id for a caller to substitute, so there is nothing
  // for an ownership check to get wrong. Everything else, including
  // the email and phone uniqueness rules, is the same service call
  // the admin screen makes.
  //
  // ==========================================================

  updateMe: asyncHandler(async (req, res) => {
    try {
      const { name, email, phone } = req.body;

      const customer = await CustomerAuthService.updateOwnProfile(req.user.id, {
        name,
        email,
        phone,
      });

      logger.info("Customer profile update completed", {
        customerId: req.user.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: { customer },
        message: "Your details were updated",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Customer profile update controller error", {
        customerId: req.user?.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to update your details");
    }
  }),

  // ==========================================================
  // POST /api/customers/auth/refresh
  // ==========================================================
  //
  // The storefront's mirror of the admin refresh. Not behind
  // `authenticate` — it is called exactly when the access token has
  // expired, and the cookie is the credential.
  //
  // This one also runs on every first paint for a returning shopper,
  // since the access token lives in memory and a page load starts with
  // none. It is the call that decides whether the header renders
  // signed-in, so it is on the critical path for how the shop looks.
  //
  // ==========================================================

  refresh: asyncHandler(async (req, res) => {
    try {
      const session = await CustomerAuthService.refresh({
        token: readRefreshCookie(req, AUDIENCE),
        userAgent: req.get("user-agent"),
        ip: req.ip,
      });

      return okResponse({
        res,
        data: sendSession(res, session),
        message: "Session renewed",
      });
    } catch (error) {
      // The session is over; the cookie goes with the 401 so the
      // storefront does not re-send a dead one on every page.
      clearRefreshCookie(res, AUDIENCE);

      if (error instanceof ApiError) throw error;

      logger.error("Customer refresh controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to renew the session");
    }
  }),

  // ==========================================================
  // POST /api/customers/auth/logout
  // ==========================================================
  //
  // Revokes the session family behind the refresh cookie, where this
  // used to only write an audit line and let the token keep working.
  //
  // No `authenticate`: the cookie is the credential, and a shopper
  // whose access token lapsed while they were reading still needs a
  // sign-out button that works.
  //
  // ==========================================================

  logout: asyncHandler(async (req, res) => {
    const revoked = await CustomerAuthService.logout(
      readRefreshCookie(req, AUDIENCE),
    );

    clearRefreshCookie(res, AUDIENCE);

    logger.info("Customer signed out", {
      customerId: req.user?.id ?? null,
      sessionRevoked: revoked,
      ip: req.ip,
    });

    return okResponse({
      res,
      data: null,
      message: "Signed out successfully",
    });
  }),
};
