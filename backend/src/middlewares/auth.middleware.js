// src/middlewares/auth.middleware.js

import jwt from "jsonwebtoken";

import { verifyToken } from "../utils/jwt.js";
import { TOKEN_USE } from "../config/auth.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

/**
 * Authenticate incoming requests using JWT.
 *
 * Expected header:
 *
 * Authorization: Bearer <token>
 */
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // ----------------------------------------------------------
    // Authorization header missing
    // ----------------------------------------------------------

    if (!authHeader) {
      throw ApiError.unauthorized(
        "Authentication token is required",
        "TOKEN_MISSING",
      );
    }

    // ----------------------------------------------------------
    // Authorization header format
    // ----------------------------------------------------------

    const [scheme, token] = authHeader.trim().split(/\s+/);

    if (!scheme || scheme.toLowerCase() !== "bearer") {
      throw ApiError.unauthorized(
        "Invalid authentication scheme",
        "TOKEN_SCHEME_INVALID",
      );
    }

    if (!token) {
      throw ApiError.unauthorized(
        "Authentication token is required",
        "TOKEN_MISSING",
      );
    }

    // ----------------------------------------------------------
    // Verify JWT
    // ----------------------------------------------------------

    const decoded = verifyToken(token);

    // ----------------------------------------------------------
    // Validate JWT payload
    // ----------------------------------------------------------

    if (!decoded || typeof decoded !== "object" || !decoded.sub) {
      logger.warn("JWT payload is invalid", {
        method: req.method,
        path: req.originalUrl,
      });

      throw ApiError.unauthorized(
        "Invalid authentication token",
        "TOKEN_INVALID",
      );
    }

    // ----------------------------------------------------------
    // Reject anything that is not an access token
    // ----------------------------------------------------------
    //
    // Both halves of a session are signed with the same secret, so a
    // refresh token verifies here perfectly well. Without this check it
    // would also be *accepted* here — handing its holder thirty days of
    // API access instead of the fifteen minutes an access token is
    // worth, and bypassing revocation entirely, since nothing on this
    // path consults `refresh_tokens`.
    //
    // Same shape as the `typ` check in requireAdmin one level down:
    // signature valid, purpose wrong.
    //
    // ----------------------------------------------------------

    if (decoded.tok !== TOKEN_USE.ACCESS) {
      logger.warn("Non-access token presented as a bearer token", {
        tok: decoded.tok ?? null,
        typ: decoded.typ ?? null,
        method: req.method,
        path: req.originalUrl,
      });

      throw ApiError.unauthorized(
        "Invalid authentication token",
        "TOKEN_TYPE_INVALID",
      );
    }

    // ----------------------------------------------------------
    // Attach authenticated user
    // ----------------------------------------------------------
    //
    // `typ` distinguishes an admin token from a storefront one.
    // Authorization middleware reads it; see requireAdmin().
    //
    // ----------------------------------------------------------

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      typ: decoded.typ,
    };

    next();
  } catch (error) {
    // ----------------------------------------------------------
    // Known application error
    // ----------------------------------------------------------

    if (error instanceof ApiError) {
      throw error;
    }

    // ----------------------------------------------------------
    // JWT errors
    // ----------------------------------------------------------

    if (error instanceof jwt.TokenExpiredError) {
      logger.warn("JWT authentication failed: token expired", {
        method: req.method,
        path: req.originalUrl,
      });

      throw ApiError.unauthorized(
        "Authentication token has expired",
        "TOKEN_EXPIRED",
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn("JWT authentication failed: invalid token", {
        method: req.method,
        path: req.originalUrl,
        error: error.message,
      });

      throw ApiError.unauthorized(
        "Invalid authentication token",
        "TOKEN_INVALID",
      );
    }

    // ----------------------------------------------------------
    // Unexpected error
    // ----------------------------------------------------------

    logger.error("Unexpected JWT authentication error", {
      method: req.method,
      path: req.originalUrl,
      error: error.message,
      stack: error.stack,
    });

    throw ApiError.internal(
      "Authentication service unavailable",
      "AUTH_UNAVAILABLE",
    );
  }
};

/**
 * Authenticate when a token is present, carry on when it is not.
 *
 * For routes that serve everybody but do more for a signed-in caller.
 * Checkout (F-07) is the one that needed it: the storefront bag says
 * "You can order without an account", so a guest must reach it, while a
 * signed-in shopper's order should attach to their account so it shows
 * up under "my orders".
 *
 * The distinction from `authenticate` is only about a *missing* token.
 * A token that is present and bad is still rejected — silently ignoring
 * an expired one would quietly file a signed-in shopper's order as a
 * guest's, and they would never see it again.
 *
 * Only for routes that are safe with no caller at all. Anything that
 * reads or writes somebody's data still needs `authenticate` plus an
 * authorization middleware; `req.user` is optional here by design, and
 * a handler that assumes it will find one is a hole.
 */
export const authenticateOptional = (req, res, next) => {
  if (!req.headers.authorization) {
    return next();
  }

  return authenticate(req, res, next);
};
