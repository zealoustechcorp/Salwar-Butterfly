// src/middlewares/authorize.middleware.js

import { ApiError } from "../utils/ApiError.js";
import { ADMIN_ROLES } from "../models/admin.entity.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { logger } from "../utils/logger.js";

/**
 * Authorization middlewares.
 *
 * These always run AFTER `authenticate`, which populates req.user
 * from the verified JWT. On its own, `authenticate` only proves the
 * token is genuine — it says nothing about what the bearer may do.
 */

// ============================================================
// REQUIRE ADMIN
// ============================================================

/**
 * Gate a route behind an admin token.
 *
 * The `typ` check is the important one. Every token in this system
 * is signed with the same JWT_SECRET, so without it a storefront
 * customer token would verify perfectly well against an admin
 * route — the signature is valid, only the audience is wrong.
 */
export const requireAdmin = (req, res, next) => {
  const user = req.user;

  if (!user) {
    throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
  }

  if (user.typ !== ADMIN_TOKEN_TYPE) {
    logger.warn("Non-admin token presented to an admin route", {
      userId: user.id,
      typ: user.typ,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    throw ApiError.forbidden(
      "You do not have permission to perform this action",
      "ADMIN_REQUIRED",
    );
  }

  if (!Object.values(ADMIN_ROLES).includes(user.role)) {
    logger.warn("Admin token carried an unrecognized role", {
      userId: user.id,
      role: user.role,
      method: req.method,
      path: req.originalUrl,
    });

    throw ApiError.forbidden(
      "You do not have permission to perform this action",
      "ADMIN_ROLE_INVALID",
    );
  }

  next();
};

// ============================================================
// REQUIRE SPECIFIC ROLE
// ============================================================

/**
 * requireRole("super_admin") — narrower than requireAdmin, for
 * routes only some admins may reach.
 *
 * Usage: router.delete("/x", authenticate, requireAdmin, requireRole(ADMIN_ROLES.SUPER_ADMIN), handler)
 */
export const requireRole = (...allowedRoles) => {
  const allowed = allowedRoles.flat();

  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      throw ApiError.unauthorized("Authentication required", "UNAUTHORIZED");
    }

    if (!allowed.includes(user.role)) {
      logger.warn("Role check failed", {
        userId: user.id,
        role: user.role,
        allowed,
        method: req.method,
        path: req.originalUrl,
      });

      throw ApiError.forbidden(
        "You do not have permission to perform this action",
        "INSUFFICIENT_ROLE",
      );
    }

    next();
  };
};
