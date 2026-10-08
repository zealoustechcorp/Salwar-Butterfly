// src/repository/inventory.repository.js
//
// Inventory (F-04) is a read model over product_variants, not a table of
// its own. Stock has always lived on the variant — one row per
// (product, size) — and duplicating it here would create two numbers
// that can disagree, which is the one thing an inventory screen must
// never do.
//
// What this adds is the direction the data is read from. The product
// screens ask "what are this product's sizes?"; inventory asks "what
// across the whole catalogue is running out?" — which is a different
// query: variant-first, joined out to its product for context, filtered
// and sorted by stock.

import { query, withTransaction } from "../config/db.js";
import { COLOUR_GROUP } from "../config/attribute.groups.js";
import { logger } from "../utils/logger.js";
import {
  MAX_STOCK,
  stockStatusCaseSql,
  stockStatusSql,
} from "../config/stock.policy.js";

const PG_ERROR_CODES = {
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
};

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Inventory repository error: ${operation}`, {
    operation,
    ...context,
    code: error.code,
    constraint: error.constraint,
    message: error.message,
  });

  if (error.code === PG_ERROR_CODES.CHECK_VIOLATION) {
    const err = new Error("STOCK_NEGATIVE");
    err.code = "STOCK_NEGATIVE";
    return err;
  }

  return error;
};

/**
 * One row per variant, carrying enough of its product to be readable on
 * its own: an inventory line that says "M — 2 left" and nothing else is
 * unusable.
 *
 * The cover photo comes from a LATERAL taking the first image rather
 * than the whole gallery — a stock table shows one thumbnail per row,
 * and aggregating eight images per line to display one is wasted work
 * on every request.
 */
const SELECT_ROW = `
  SELECT
    v.id,
    v.product_id,
    v.size,
    v.colour,
    v.stock_quantity,
    v.active,
    v.position,
    v.created_at,
    v.updated_at,
    ${stockStatusCaseSql("v")} AS stock_status,
    reg.hex         AS colour_hex,
    p.name          AS product_name,
    p.slug          AS product_slug,
    p.active        AS product_active,
    p.current_price AS product_price,
    p.category_id   AS category_id,
    c.name          AS category_name,
    img.image_url   AS product_image_url
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  -- The swatch, so a stock table can be scanned by colour rather than
  -- read word by word. Joined from the register for the same reason the
  -- product screens join it: a colour re-toned there must not leave a
  -- stale swatch behind on every row that carries it.
  LEFT JOIN product_attribute_values reg
    ON reg.group_name = '${COLOUR_GROUP}' AND reg.value = v.colour
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.position ASC, pi.created_at ASC
    LIMIT 1
  ) img ON TRUE
`;

/**
 * Sort orders the screen offers, as a whitelist — the value arrives from
 * a query string and is interpolated, so it can never be the caller's
 * own text.
 *
 * `stock_asc` is the default on purpose: the reason to open an inventory
 * screen is to find what is about to run out, and that should not need a
 * sort click.
 */
const SORTS = {
  stock_asc: "v.stock_quantity ASC, p.name ASC, v.position ASC",
  stock_desc: "v.stock_quantity DESC, p.name ASC, v.position ASC",
  product: "p.name ASC, v.position ASC, v.colour ASC, v.size ASC",
  updated: "v.updated_at DESC, p.name ASC",
  // Colour-first, so every row of one colourway across the catalogue
  // reads together — the order a delivery of "the Maroon run" is
  // checked in against.
  colour: "v.colour ASC, p.name ASC, v.position ASC, v.size ASC",
};

export const DEFAULT_SORT = "stock_asc";

/**
 * Builds the shared WHERE clause.
 *
 * @returns {{clause: string, values: unknown[]}} `clause` includes the
 *          leading WHERE, or is empty when nothing was filtered.
 */
const buildFilters = ({ status, search, categoryId, productId, activeOnly }) => {
  const conditions = [];
  const values = [];

  const statusSql = stockStatusSql(status, "v");
  if (statusSql) conditions.push(`(${statusSql})`);

  if (categoryId) {
    values.push(categoryId);
    conditions.push(`p.category_id = $${values.length}::uuid`);
  }

  if (productId) {
    values.push(productId);
    conditions.push(`v.product_id = $${values.length}::uuid`);
  }

  // Deactivated products still hold stock and still belong in a stock
  // count, so they are included unless the caller says otherwise.
  if (activeOnly) {
    conditions.push("p.active = TRUE");
  }

  if (search) {
    values.push(`%${search}%`);
    const like = `$${values.length}`;
    values.push(search);
    const exact = `$${values.length}`;

    // Size matches exactly rather than by prefix: searching "L" should
    // find size L, not every product with an L in its name. Colour is
    // the other way round — "rani" should find "Rani Pink", because a
    // colour is a name rather than a code and nobody types it in full.
    conditions.push(
      `(p.name ILIKE ${like}
        OR p.slug ILIKE ${like}
        OR v.colour ILIKE ${like}
        OR UPPER(v.size) = UPPER(${exact}))`,
    );
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
};

export const InventoryRepository = {
  /**
   * A page of inventory lines.
   *
   * Filtering happens in SQL rather than after the fetch, because the
   * screen paginates: dropping non-matching rows from an already-fetched
   * page would return short pages and a total that counts rows the admin
   * cannot see.
   */
  async findAll({
    status = null,
    search = null,
    categoryId = null,
    productId = null,
    activeOnly = false,
    sort = DEFAULT_SORT,
    page = 1,
    limit = 50,
  } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (safePage - 1) * safeLimit;
    const orderBy = SORTS[sort] ?? SORTS[DEFAULT_SORT];

    const { clause, values } = buildFilters({
      status,
      search,
      categoryId,
      productId,
      activeOnly,
    });

    const text = `
      ${SELECT_ROW}
      ${clause}
      ORDER BY ${orderBy}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    const countText = `
      SELECT COUNT(*)::INTEGER AS count
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      ${clause}
    `;

    try {
      const [result, countResult] = await Promise.all([
        query(text, [...values, safeLimit, offset]),
        query(countText, values),
      ]);

      return {
        rows: result.rows,
        total: countResult.rows[0]?.count ?? 0,
      };
    } catch (error) {
      throw handleDatabaseError(error, "findAll", { status, sort });
    }
  },

  /**
   * Catalogue-wide counts for the stat tiles.
   *
   * Deliberately not derived from the page above — a page is 50 rows and
   * the tiles describe all of them. One grouped query rather than four
   * counts, so the numbers are read at a single instant and cannot
   * disagree with each other.
   *
   * The same shape feeds F-11's dashboard when it lands.
   */
  async summary({ categoryId = null, activeOnly = false } = {}) {
    const { clause, values } = buildFilters({
      status: null,
      search: null,
      categoryId,
      productId: null,
      activeOnly,
    });

    const text = `
      SELECT
        ${stockStatusCaseSql("v")}      AS stock_status,
        COUNT(*)::INTEGER               AS size_count,
        COUNT(DISTINCT v.product_id)::INTEGER AS product_count,
        COALESCE(SUM(v.stock_quantity), 0)::INTEGER AS units
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      ${clause}
      GROUP BY 1
    `;

    // Products carrying no sizes at all cannot appear above — they have
    // no variant rows to group. They are still un-sellable and still the
    // admin's problem, so they are counted separately.
    //
    // Its own parameter list, not the one built above: this query joins
    // no variants, so it references neither the status nor the search
    // placeholders, and binding a parameter a statement does not use is
    // an error in Postgres rather than a no-op.
    const orphanValues = categoryId ? [categoryId] : [];
    const orphanText = `
      SELECT COUNT(*)::INTEGER AS count
      FROM products p
      WHERE NOT EXISTS (
        SELECT 1 FROM product_variants v WHERE v.product_id = p.id
      )
      ${activeOnly ? "AND p.active = TRUE" : ""}
      ${categoryId ? "AND p.category_id = $1::uuid" : ""}
    `;

    try {
      const [result, orphanResult] = await Promise.all([
        query(text, values),
        query(orphanText, orphanValues),
      ]);

      return {
        byStatus: result.rows,
        productsWithoutSizes: orphanResult.rows[0]?.count ?? 0,
      };
    } catch (error) {
      throw handleDatabaseError(error, "summary", { categoryId });
    }
  },

  async findById(id) {
    const text = `
      ${SELECT_ROW}
      WHERE v.id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { variantId: id });
    }
  },

  /**
   * Several lines by id, in one round trip — what a bulk adjustment
   * reads back so its response carries the same shape the table renders
   * rather than bare variant rows.
   */
  async findByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const text = `
      ${SELECT_ROW}
      WHERE v.id = ANY($1::uuid[])
    `;

    try {
      const result = await query(text, [ids]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "findByIds", { count: ids.length });
    }
  },

  /**
   * Moves stock by a delta, in the database (F-04.04).
   *
   * The arithmetic happens in SQL — `stock_quantity + $2`, never a read
   * followed by a write — so two admins receiving the same delivery at
   * the same moment both count. Read-modify-write would have the second
   * save silently overwrite the first.
   *
   * The bounds in the WHERE clause are what stop stock going negative —
   * or absurdly high — under that same concurrency. The CHECK constraint
   * would also catch the negative case, but as a 500-shaped database
   * error rather than a sentence the admin can act on.
   *
   * @returns {object|null} the updated row, or null when it did not
   *          apply — the caller separates "no such variant" from
   *          "that would go out of bounds".
   */
  async adjustStock(id, delta) {
    const text = `
      UPDATE product_variants
      SET stock_quantity = stock_quantity + $2,
          updated_at = NOW()
      WHERE id = $1::uuid
        AND stock_quantity + $2 >= 0
        AND stock_quantity + $2 <= ${MAX_STOCK}
      RETURNING *
    `;

    try {
      const result = await query(text, [id, delta]);
      if (result.rowCount === 0) return null;

      logger.info("Stock adjusted", {
        variantId: id,
        delta,
        stockQuantity: result.rows[0]?.stock_quantity,
      });

      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "adjustStock", { variantId: id, delta });
    }
  },

  /**
   * Sets stock to an absolute figure — a stock-take rather than a
   * movement.
   *
   * `expected` makes it optimistically concurrent: pass the quantity the
   * screen was showing and the write only lands if that is still the
   * quantity on the row. Without it, an admin correcting a count from a
   * stale page silently discards whatever changed in between.
   *
   * @param {number|null} expected  null skips the check
   */
  async setStock(id, stockQuantity, expected = null) {
    const text = `
      UPDATE product_variants
      SET stock_quantity = $2,
          updated_at = NOW()
      WHERE id = $1::uuid
        AND ($3::INTEGER IS NULL OR stock_quantity = $3)
      RETURNING *
    `;

    try {
      const result = await query(text, [id, stockQuantity, expected]);
      if (result.rowCount === 0) return null;

      logger.info("Stock set", { variantId: id, stockQuantity });
      return result.rows[0];
    } catch (error) {
      throw handleDatabaseError(error, "setStock", { variantId: id });
    }
  },

  /**
   * Many adjustments as one transaction — receiving a delivery, where
   * six sizes arrive together.
   *
   * All or nothing: if one line would take a size below zero the whole
   * batch rolls back. A half-applied delivery is worse than a rejected
   * one, because the admin cannot tell by looking which half landed.
   *
   * @param {Array<{variantId: string, delta: number}>} adjustments
   * @returns {Promise<object[]>} the updated rows, in input order
   */
  async bulkAdjustStock(adjustments) {
    try {
      return await withTransaction(async (client) => {
        const rows = [];

        for (const { variantId, delta } of adjustments) {
          const result = await client.query(
            `UPDATE product_variants
             SET stock_quantity = stock_quantity + $2,
                 updated_at = NOW()
             WHERE id = $1::uuid
               AND stock_quantity + $2 >= 0
               AND stock_quantity + $2 <= ${MAX_STOCK}
             RETURNING *`,
            [variantId, delta],
          );

          if (result.rowCount === 0) {
            // Which case it is decides the message, so find out now —
            // after the rollback the row is out of reach.
            const exists = await client.query(
              "SELECT stock_quantity FROM product_variants WHERE id = $1::uuid",
              [variantId],
            );

            const current = exists.rows[0]?.stock_quantity ?? 0;
            const code =
              exists.rowCount === 0
                ? "VARIANT_NOT_FOUND"
                : Number(current) + delta < 0
                  ? "STOCK_NEGATIVE"
                  : "STOCK_CEILING";

            const error = new Error(code);
            error.code = code;
            error.variantId = variantId;
            error.available = Number(current);
            error.delta = delta;
            throw error;
          }

          rows.push(result.rows[0]);
        }

        logger.info("Bulk stock adjustment applied", {
          count: rows.length,
        });

        return rows;
      });
    } catch (error) {
      if (
        error?.code === "VARIANT_NOT_FOUND" ||
        error?.code === "STOCK_NEGATIVE" ||
        error?.code === "STOCK_CEILING"
      ) {
        throw error;
      }

      throw handleDatabaseError(error, "bulkAdjustStock", {
        count: adjustments.length,
      });
    }
  },
};
