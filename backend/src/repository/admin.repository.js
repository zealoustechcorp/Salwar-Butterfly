import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

// ============================================================
// POSTGRESQL CONSTRAINTS
// ============================================================

const ADMIN_CONSTRAINTS = Object.freeze({
  EMAIL_UNIQUE: "admins_email_unique",
  ROLE_CHECK: "admins_role_check",
});

// ============================================================
// POSTGRESQL ERROR CODES
// ============================================================

const PG_ERROR_CODES = Object.freeze({
  UNIQUE_VIOLATION: "23505",
  NOT_NULL_VIOLATION: "23502",
  CHECK_VIOLATION: "23514",
  INVALID_TEXT_REPRESENTATION: "22P02",
  UNDEFINED_TABLE: "42P01",
  CONNECTION_EXCEPTION: "08000",
  CONNECTION_FAILURE: "08006",
});

// ============================================================
// APPLICATION DATABASE ERROR
// ============================================================

class RepositoryError extends Error {
  constructor(code, message, options = {}) {
    super(message);

    this.name = "RepositoryError";
    this.code = code;
    this.cause = options.cause;
    this.constraint = options.constraint;
  }
}

// ============================================================
// DATABASE ERROR TRANSLATOR
// ============================================================

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Admin repository error: ${operation}`, {
    operation,
    ...context,

    // PostgreSQL diagnostic information
    code: error?.code,
    constraint: error?.constraint,
    table: error?.table,
    column: error?.column,
    detail: error?.detail,

    // Never log sensitive values
    message: error?.message,
    stack: error?.stack,
  });

  // ----------------------------------------------------------
  // UNIQUE VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.UNIQUE_VIOLATION) {
    if (error.constraint === ADMIN_CONSTRAINTS.EMAIL_UNIQUE) {
      return new RepositoryError(
        "ADMIN_EMAIL_EXISTS",
        "Admin email already exists",
        {
          cause: error,
          constraint: error.constraint,
        },
      );
    }

    return new RepositoryError("ADMIN_DUPLICATE", "Admin already exists", {
      cause: error,
      constraint: error.constraint,
    });
  }

  // ----------------------------------------------------------
  // NOT NULL VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
    return new RepositoryError(
      "ADMIN_REQUIRED_FIELD",
      "Required admin field is missing",
      {
        cause: error,
      },
    );
  }

  // ----------------------------------------------------------
  // CHECK CONSTRAINT VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.CHECK_VIOLATION) {
    if (error.constraint === ADMIN_CONSTRAINTS.ROLE_CHECK) {
      return new RepositoryError("ADMIN_ROLE_INVALID", "Invalid admin role", {
        cause: error,
        constraint: error.constraint,
      });
    }

    return new RepositoryError(
      "ADMIN_DATA_INVALID",
      "Admin data violates a database rule",
      {
        cause: error,
        constraint: error.constraint,
      },
    );
  }

  // ----------------------------------------------------------
  // INVALID UUID / INVALID DB VALUE
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION) {
    return new RepositoryError("ADMIN_INVALID_ID", "Invalid admin identifier", {
      cause: error,
    });
  }

  // ----------------------------------------------------------
  // TABLE MISSING
  // ----------------------------------------------------------
  //
  // Migrations are applied by hand in this project, so a missing
  // `admins` table is a realistic first-run failure. Say so
  // plainly instead of surfacing a generic database error.
  //
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.UNDEFINED_TABLE) {
    return new RepositoryError(
      "ADMIN_TABLE_MISSING",
      "The admins table does not exist. Run src/migrations/002_create_admins.sql",
      {
        cause: error,
      },
    );
  }

  // ----------------------------------------------------------
  // DATABASE CONNECTION FAILURE
  // ----------------------------------------------------------

  if (
    error?.code === PG_ERROR_CODES.CONNECTION_EXCEPTION ||
    error?.code === PG_ERROR_CODES.CONNECTION_FAILURE
  ) {
    return new RepositoryError(
      "DATABASE_UNAVAILABLE",
      "Database is temporarily unavailable",
      {
        cause: error,
      },
    );
  }

  // ----------------------------------------------------------
  // UNKNOWN DATABASE ERROR
  // ----------------------------------------------------------

  return new RepositoryError("DATABASE_ERROR", "Database operation failed", {
    cause: error,
  });
};

// ============================================================
// REPOSITORY
// ============================================================

export const AdminRepository = Object.freeze({
  // ==========================================================
  // CREATE ADMIN
  // ==========================================================

  async save(name, email, password, role) {
    const text = `
      INSERT INTO admins (
        name,
        email,
        password,
        role
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        email,
        role,
        active,
        last_login_at,
        created_at,
        updated_at
    `;

    try {
      const result = await query(text, [name, email, password, role]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "save", { email });
    }
  },

  // ==========================================================
  // FIND ADMIN BY ID
  // ==========================================================

  async findById(id) {
    const text = `
      SELECT
        id,
        name,
        email,
        role,
        active,
        last_login_at,
        created_at,
        updated_at
      FROM admins
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { adminId: id });
    }
  },

  // ==========================================================
  // FIND ADMIN BY EMAIL FOR AUTHENTICATION
  // ==========================================================
  //
  // The only query in the codebase that returns `password`.
  // Its result must never leave AdminAuthService.
  //
  // ==========================================================

  async findByEmailForAuth(email) {
    const text = `
      SELECT
        id,
        name,
        email,
        password,
        role,
        active,
        last_login_at,
        created_at,
        updated_at
      FROM admins
      WHERE email = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [email]);

      return result.rows[0] ?? null;
    } catch (error) {
      // `email` is intentionally omitted from the log context here —
      // failed logins should not write addresses into the log files.
      throw handleDatabaseError(error, "findByEmailForAuth");
    }
  },

  // ==========================================================
  // RECORD SUCCESSFUL LOGIN
  // ==========================================================

  async touchLastLogin(id) {
    const text = `
      UPDATE admins
      SET
        last_login_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        last_login_at
    `;

    try {
      const result = await query(text, [id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "touchLastLogin", { adminId: id });
    }
  },
});
