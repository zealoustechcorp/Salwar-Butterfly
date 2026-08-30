// src/middlewares/auth.middleware.js

import jwt from "jsonwebtoken";

import { verifyToken } from "../utils/jwt.js";
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
