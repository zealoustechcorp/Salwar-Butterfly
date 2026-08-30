// src/services/admin.auth.service.js

import bcrypt from "bcrypt";

import { AdminRepository } from "../repository/admin.repository.js";
import { AdminMapper } from "../mapper/admin.mapper.js";
import { LoginAdminDTO, CreateAdminDTO } from "../dto/admin.dto.js";
import { ADMIN_ROLES } from "../models/admin.entity.js";
import { generateToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

// ============================================================
// CONSTANTS
// ============================================================

const BCRYPT_COST = 12;

/**
 * Token audience marker.
 *
 * Customer tokens (when that flow lands) will carry a different
 * `typ`, so a storefront token can never be replayed against an
 * admin route even though both are signed with the same secret.
 */
export const ADMIN_TOKEN_TYPE = "admin";

/**
 * A throwaway hash compared against when no admin matches the
 * submitted email.
 *
 * Without it, an unknown address returns in ~1ms while a known one
 * spends ~250ms in bcrypt — a difference large enough to enumerate
 * valid admin accounts over the network. Hashing a random value at
 * boot guarantees the constant is well-formed and uses the same
 * cost factor as real hashes.
 */
const TIMING_DECOY_HASH = bcrypt.hashSync(
  `decoy:${Math.random()}:${Date.now()}`,
  BCRYPT_COST,
);

/**
 * One message for every failure mode below. Distinguishing "no such
 * admin" from "wrong password" from "account disabled" would hand an
 * attacker a free account-enumeration oracle.
 */
const INVALID_CREDENTIALS = "Invalid email or password";

// ============================================================
// SERVICE
// ============================================================

export const AdminAuthService = Object.freeze({
  // ==========================================================
  // LOGIN
  // ==========================================================

  async login(email, password) {
    const dto = new LoginAdminDTO(email, password);

    let admin = null;

    try {
      admin = await AdminRepository.findByEmailForAuth(dto.email);
    } catch (error) {
      if (error?.code === "ADMIN_TABLE_MISSING") {
        logger.error("Admin login attempted before migration was applied");

        throw ApiError.internal(
          "Admin authentication is not configured",
          "ADMIN_TABLE_MISSING",
        );
      }

      if (error?.code === "DATABASE_UNAVAILABLE") {
        throw ApiError.serviceUnavailable(
          "Service temporarily unavailable. Please try again.",
          "DATABASE_UNAVAILABLE",
        );
      }

      logger.error("Admin login repository failure", {
        code: error?.code,
        message: error?.message,
      });

      throw ApiError.internal("Unable to sign in right now");
    }

    // --------------------------------------------------------
    // VERIFY PASSWORD
    // --------------------------------------------------------
    //
    // Always run bcrypt.compare, even when no row came back, so
    // both branches cost the same wall-clock time.
    //
    // --------------------------------------------------------

    const passwordMatches = await bcrypt.compare(
      dto.password,
      admin?.password ?? TIMING_DECOY_HASH,
    );

    if (!admin || !passwordMatches) {
      logger.warn("Admin login failed: invalid credentials", {
        // The submitted address is not logged — failed logins are
        // exactly where a mistyped password ends up in the email
        // field, and these files are retained on disk.
        matchedAdmin: Boolean(admin),
      });

      throw ApiError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
    }

    // --------------------------------------------------------
    // ACCOUNT DISABLED
    // --------------------------------------------------------

    if (!admin.active) {
      logger.warn("Admin login failed: account disabled", {
        adminId: admin.id,
      });

      throw ApiError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
    }

    // --------------------------------------------------------
    // ISSUE TOKEN
    // --------------------------------------------------------

    const token = generateToken({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      typ: ADMIN_TOKEN_TYPE,
    });

    // --------------------------------------------------------
    // RECORD THE LOGIN
    // --------------------------------------------------------
    //
    // Best-effort. A failure to stamp last_login_at must not cost
    // the admin a successful sign-in.
    //
    // --------------------------------------------------------

    try {
      await AdminRepository.touchLastLogin(admin.id);
    } catch (error) {
      logger.warn("Failed to record admin last_login_at", {
        adminId: admin.id,
        code: error?.code,
      });
    }

    logger.info("Admin login succeeded", {
      adminId: admin.id,
      role: admin.role,
    });

    return {
      admin: AdminMapper.toAuthDTO(admin),
      token,
      expiresIn: env.jwtExpiresIn,
    };
  },

  // ==========================================================
  // CURRENT ADMIN
  // ==========================================================
  //
  // Re-reads the row on every call rather than trusting the token
  // body, so deactivating or soft-deleting an admin takes effect
  // immediately instead of when their token happens to expire.
  //
  // ==========================================================

  async getCurrentAdmin(adminId) {
    const admin = await AdminRepository.findById(adminId);

    if (!admin || !admin.active) {
      throw ApiError.unauthorized(
        "Your session is no longer valid",
        "SESSION_INVALID",
      );
    }

    return AdminMapper.toAuthDTO(admin);
  },

  // ==========================================================
  // CREATE ADMIN  (used by scripts/createAdmin.js)
  // ==========================================================

  async createAdmin(name, email, password, role = ADMIN_ROLES.ADMIN) {
    const dto = new CreateAdminDTO(name, email, password, role);

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST);

    try {
      const created = await AdminRepository.save(
        dto.name,
        dto.email,
        hashedPassword,
        dto.role,
      );

      return AdminMapper.toDTO(created);
    } catch (error) {
      if (error?.code === "ADMIN_EMAIL_EXISTS") {
        throw ApiError.conflict(
          "An admin with this email already exists",
          "ADMIN_EMAIL_EXISTS",
        );
      }

      if (error?.code === "ADMIN_ROLE_INVALID") {
        throw ApiError.badRequest("Invalid admin role", "ADMIN_ROLE_INVALID");
      }

      throw error;
    }
  },
});
