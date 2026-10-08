// src/controllers/admin.auth.controller.js

import { AdminAuthService } from "../services/admin.auth.service.js";
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

const AUDIENCE = AUTH_AUDIENCE.ADMIN;

/**
 * Split a session between the two channels it travels on.
 *
 * The access token goes in the body, where the panel can hold it in
 * memory and put it on an Authorization header. The refresh token goes
 * in an httpOnly cookie and is never named in the response — which is
 * the point: the panel cannot read it, so neither can anything injected
 * into the panel.
 */
const sendSession = (res, session) => {
  setRefreshCookie(res, AUDIENCE, session.refreshToken, session.refreshExpiresAt);

  return { accessToken: session.accessToken };
};

export const AdminAuthController = {
  // ==========================================================
  // POST /api/admin/auth/login
  // ==========================================================

  login: asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await AdminAuthService.login(email, password, {
        userAgent: req.get("user-agent"),
        ip: req.ip,
      });

      logger.info("Admin login request completed", {
        adminId: result.admin.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: {
          admin: result.admin,
          ...sendSession(res, result.session),
        },
        message: "Signed in successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Admin login controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to sign in");
    }
  }),

  // ==========================================================
  // GET /api/admin/auth/me
  // ==========================================================
  //
  // The panel calls this on boot to turn a stored token back into
  // an identity, and to confirm the token still corresponds to an
  // active account.
  //
  // ==========================================================

  me: asyncHandler(async (req, res) => {
    try {
      const admin = await AdminAuthService.getCurrentAdmin(req.user.id);

      return okResponse({
        res,
        data: { admin },
        message: "Admin retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Admin me controller error", {
        adminId: req.user?.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to load the current admin");
    }
  }),

  // ==========================================================
  // POST /api/admin/auth/refresh
  // ==========================================================
  //
  // The only route in the API authenticated by a cookie rather than an
  // Authorization header, and so the only one a cross-site request
  // could reach with credentials attached. SameSite=Strict on the
  // cookie is what closes that: the browser does not send it
  // cross-site at all, and the new access token exists only in a
  // response body an attacker's page cannot read.
  //
  // Deliberately not behind `authenticate` — it is called precisely
  // when the access token has expired, so requiring a valid one would
  // make it unreachable at the only moment it is needed.
  //
  // ==========================================================

  refresh: asyncHandler(async (req, res) => {
    try {
      const session = await AdminAuthService.refresh({
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
      // A refused refresh means this browser's session is over, so the
      // dead cookie goes with the 401. Left in place it would be
      // re-sent on every subsequent attempt, and the panel would retry
      // its way through a loop that cannot succeed.
      clearRefreshCookie(res, AUDIENCE);

      if (error instanceof ApiError) throw error;

      logger.error("Admin refresh controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw ApiError.internal("Failed to renew the session");
    }
  }),

  // ==========================================================
  // POST /api/admin/auth/logout
  // ==========================================================
  //
  // This used to write an audit line and nothing else — the comment
  // here said a JWT is stateless so discarding it *is* the logout,
  // which was true and was the problem: a token the shop wanted to
  // withdraw went on working for a full day.
  //
  // Now it revokes the session family behind the refresh cookie, and
  // the session is over within one access-token lifetime.
  //
  // No `authenticate`: the cookie is the credential here, and somebody
  // whose access token has already expired still needs to be able to
  // sign out. Nothing is authorised by this route beyond ending the
  // session whose token was presented.
  //
  // ==========================================================

  logout: asyncHandler(async (req, res) => {
    const revoked = await AdminAuthService.logout(
      readRefreshCookie(req, AUDIENCE),
    );

    clearRefreshCookie(res, AUDIENCE);

    logger.info("Admin signed out", {
      adminId: req.user?.id ?? null,
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
