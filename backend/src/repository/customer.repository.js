import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

// ============================================================
// POSTGRESQL CONSTRAINTS
// ============================================================

const CUSTOMER_CONSTRAINTS = Object.freeze({
  EMAIL_UNIQUE: "customers_email_unique",
  PHONE_UNIQUE: "customers_phone_unique",
});

// ============================================================
// POSTGRESQL ERROR CODES
// ============================================================

const PG_ERROR_CODES = Object.freeze({
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  NOT_NULL_VIOLATION: "23502",
  CHECK_VIOLATION: "23514",
  INVALID_TEXT_REPRESENTATION: "22P02",
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
  logger.error(`Customer repository error: ${operation}`, {
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
    if (error.constraint === CUSTOMER_CONSTRAINTS.EMAIL_UNIQUE) {
      return new RepositoryError(
        "CUSTOMER_EMAIL_EXISTS",
        "Customer email already exists",
        {
          cause: error,
          constraint: error.constraint,
        },
      );
    }

    if (error.constraint === CUSTOMER_CONSTRAINTS.PHONE_UNIQUE) {
      return new RepositoryError(
        "CUSTOMER_PHONE_EXISTS",
        "Customer phone number already exists",
        {
          cause: error,
          constraint: error.constraint,
        },
      );
    }

    return new RepositoryError(
      "CUSTOMER_DUPLICATE",
      "Customer already exists",
      {
        cause: error,
        constraint: error.constraint,
      },
    );
  }

  // ----------------------------------------------------------
  // FOREIGN KEY VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    return new RepositoryError(
      "CUSTOMER_REFERENCE_VIOLATION",
      "Referenced customer record does not exist",
      {
        cause: error,
        constraint: error.constraint,
      },
    );
  }

  // ----------------------------------------------------------
  // NOT NULL VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.NOT_NULL_VIOLATION) {
    return new RepositoryError(
      "CUSTOMER_REQUIRED_FIELD",
      "Required customer field is missing",
      {
        cause: error,
      },
    );
  }

  // ----------------------------------------------------------
  // CHECK CONSTRAINT VIOLATION
  // ----------------------------------------------------------

  if (error?.code === PG_ERROR_CODES.CHECK_VIOLATION) {
    return new RepositoryError(
      "CUSTOMER_DATA_INVALID",
      "Customer data violates a database rule",
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
    return new RepositoryError(
      "CUSTOMER_INVALID_ID",
      "Invalid customer identifier",
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

export const CustomerRepository = Object.freeze({
  // ==========================================================
  // CREATE CUSTOMER
  // ==========================================================

  async save(name, email, phone, password) {
    const text = `
      INSERT INTO customers (
        name,
        email,
        phone,
        password
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
    `;

    try {
      const result = await query(text, [name, email, phone, password]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "save");
    }
  },

  // ==========================================================
  // FIND CUSTOMER BY ID
  // ==========================================================

  async findById(id) {
    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM customers
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", {
        customerId: id,
      });
    }
  },

  // ==========================================================
  // FIND CUSTOMER BY ID FOR AUTHENTICATION
  // ==========================================================

  async findByIdForAuth(id) {
    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        password,
        created_at,
        updated_at
      FROM customers
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByIdForAuth", {
        customerId: id,
      });
    }
  },

  // ==========================================================
  // FIND CUSTOMER BY EMAIL
  // ==========================================================

  async findByEmail(email) {
    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM customers
      WHERE email = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [email]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByEmail", {
        email,
      });
    }
  },

  // ==========================================================
  // FIND CUSTOMER BY PHONE
  // ==========================================================

  async findByPhone(phone) {
    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM customers
      WHERE phone = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;

    try {
      const result = await query(text, [phone]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findByPhone", {
        phone,
      });
    }
  },

  // ==========================================================
  // FIND ALL CUSTOMERS
  // ==========================================================

  async findAll({ page = 1, limit = 25 } = {}) {
    const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);

    const safeLimit = Math.min(
      Math.max(Number.parseInt(limit, 10) || 25, 1),
      100,
    );

    const offset = (safePage - 1) * safeLimit;

    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM customers
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
      OFFSET $2
    `;

    try {
      const result = await query(text, [safeLimit, offset]);

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findAll", {
        page: safePage,
        limit: safeLimit,
      });
    }
  },

  // ==========================================================
  // UPDATE CUSTOMER
  // ==========================================================

  async update(id, name, email, phone) {
    const text = `
      UPDATE customers
      SET
        name = $1,
        email = $2,
        phone = $3,
        updated_at = NOW()
      WHERE id = $4
        AND deleted_at IS NULL
      RETURNING
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
    `;

    try {
      const result = await query(text, [name, email, phone, id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "update", {
        customerId: id,
      });
    }
  },

  // ==========================================================
  // SOFT DELETE CUSTOMER
  // ==========================================================

  async softDelete(id) {
    const text = `
      UPDATE customers
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        deleted_at
    `;

    try {
      const result = await query(text, [id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "softDelete", {
        customerId: id,
      });
    }
  },

  // ==========================================================
  // UPDATE PASSWORD
  // ==========================================================

  async updatePassword(id, hashedPassword) {
    const text = `
      UPDATE customers
      SET
        password = $1,
        updated_at = NOW()
      WHERE id = $2
        AND deleted_at IS NULL
      RETURNING
        id,
        name,
        email,
        phone,
        updated_at
    `;

    try {
      const result = await query(text, [hashedPassword, id]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "updatePassword", {
        customerId: id,
      });
    }
  },
});
