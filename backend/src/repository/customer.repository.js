import { query } from "../config/db.js";
import {
  clampPagination,
  customerSortSql,
  DEFAULT_SORT,
  escapeLikePattern,
} from "../config/customer.query.js";
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
// LIST FILTERS
// ============================================================

/**
 * The WHERE clause shared by findAll and countAll.
 *
 * One builder for both, deliberately: a total that was counted with a
 * different filter than the rows is worse than no total at all — the
 * screen would draw pages that come back empty.
 */
const buildListFilters = (search) => {
  const conditions = ["deleted_at IS NULL"];
  const values = [];

  const term = String(search ?? "").trim();

  if (term) {
    // One parameter, three columns. An admin looking someone up has a
    // name, an email or a phone number in front of them and should not
    // have to say which.
    values.push(`%${escapeLikePattern(term)}%`);

    const placeholder = `$${values.length}`;

    conditions.push(`(
      name ILIKE ${placeholder} ESCAPE '\\'
      OR email ILIKE ${placeholder} ESCAPE '\\'
      OR phone ILIKE ${placeholder} ESCAPE '\\'
    )`);
  }

  return {
    where: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
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

  async findAll({ page = 1, limit, search = "", sort = DEFAULT_SORT } = {}) {
    const { page: safePage, limit: safeLimit } = clampPagination({
      page,
      limit,
    });

    const offset = (safePage - 1) * safeLimit;

    const { where, values } = buildListFilters(search);

    // LIMIT/OFFSET are appended after the filter values, so their
    // placeholder numbers depend on whether a search was supplied.
    const limitPlaceholder = `$${values.length + 1}`;
    const offsetPlaceholder = `$${values.length + 2}`;

    const text = `
      SELECT
        id,
        name,
        email,
        phone,
        created_at,
        updated_at
      FROM customers
      ${where}
      ORDER BY ${customerSortSql(sort, "customers")}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `;

    try {
      const result = await query(text, [...values, safeLimit, offset]);

      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findAll", {
        page: safePage,
        limit: safeLimit,
        sort,
      });
    }
  },

  // ==========================================================
  // COUNT CUSTOMERS
  // ==========================================================

  /**
   * How many customers the current filter matches.
   *
   * Its own round trip rather than a window function beside the rows,
   * because the count has to survive an empty page — a search that
   * matches nothing still needs to report zero, and a COUNT(*) OVER ()
   * on no rows returns nothing at all.
   */
  async countAll({ search = "" } = {}) {
    const { where, values } = buildListFilters(search);

    const text = `
      SELECT COUNT(*)::int AS total
      FROM customers
      ${where}
    `;

    try {
      const result = await query(text, values);

      return result.rows[0]?.total ?? 0;
    } catch (error) {
      throw handleDatabaseError(error, "countAll");
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
