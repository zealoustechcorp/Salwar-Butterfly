// src/controllers/admin.auth.controller.js

import { AdminAuthService } from "../services/admin.auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export const AdminAuthController = {
  // ==========================================================
  // POST /api/admin/auth/login
  // ==========================================================

  login: asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await AdminAuthService.login(email, password);

      logger.info("Admin login request completed", {
        adminId: result.admin.id,
        ip: req.ip,
      });

      return okResponse({
        res,
        data: result,
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
  // POST /api/admin/auth/logout
  // ==========================================================
  //
  // JWTs are stateless, so the client discarding its token IS the
  // logout. This endpoint exists so the act is auditable, and so a
  // future token denylist has somewhere to live.
  //
  // ==========================================================

  logout: asyncHandler(async (req, res) => {
    logger.info("Admin signed out", {
      adminId: req.user?.id,
      ip: req.ip,
    });

    return okResponse({
      res,
      data: null,
      message: "Signed out successfully",
    });
  }),
};
