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
      throw new ApiError(401, "Authentication token is required");
    }

    // ----------------------------------------------------------
    // Authorization header format
    // ----------------------------------------------------------

    const [scheme, token] = authHeader.trim().split(/\s+/);

    if (!scheme || scheme.toLowerCase() !== "bearer") {
      throw new ApiError(401, "Invalid authentication scheme");
    }

    if (!token) {
      throw new ApiError(401, "Authentication token is required");
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

      throw new ApiError(401, "Invalid authentication token");
    }

    // ----------------------------------------------------------
    // Attach authenticated user
    // ----------------------------------------------------------

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
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

      throw new ApiError(401, "Authentication token has expired");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn("JWT authentication failed: invalid token", {
        method: req.method,
        path: req.originalUrl,
        error: error.message,
      });

      throw new ApiError(401, "Invalid authentication token");
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

    throw new ApiError(500, "Authentication service unavailable");
  }
};
