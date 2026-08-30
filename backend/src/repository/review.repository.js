// src/repository/review.repository.js
//
// Reviews and ratings (F-11.06).
//
// An ordinary CRUD table, with one thing worth pointing at: every read
// joins out to the product, and the admin list has no useful meaning
// without it. A review that says "★★★★★ — lovely fabric" and does not
// say what it is about is a row nobody can act on, so the product's
// name and cover photo travel with it the way the inventory read model
// carries them.
//
// The rating aggregate lives here too. It is the number the storefront
// will eventually print next to a product (F-06.08) and the number the
// admin screen shows while curating, and computing it twice in two
// places is how those two come to disagree.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { DEFAULT_SORT, reviewSortSql } from "../config/review.policy.js";

const PG_ERROR_CODES = {
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
};

/**
 * Turns the two constraint failures that are really user errors into
 * codes the service can translate, and passes everything else through.
 *
 * Both are already refused by the validator, so reaching one means
 * something wrote through another path — which is exactly when a
 * readable failure is worth the most.
 */
const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Review repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  if (error?.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
    const err = new Error(
      error.constraint === "fk_reviews_customer"
        ? "CUSTOMER_NOT_FOUND"
        : "PRODUCT_NOT_FOUND",
    );
    err.code = err.message;
    return err;
  }

  if (error?.code === PG_ERROR_CODES.CHECK_VIOLATION) {
    const err = new Error("RATING_OUT_OF_RANGE");
    err.code = "RATING_OUT_OF_RANGE";
    return err;
  }

  return error;
};

/**
 * A review with enough of its product to be readable on its own.
 *
 * The cover photo comes from a LATERAL taking the first image rather
 * than the whole gallery — one thumbnail per row, so aggregating eight
 * images to display one is wasted work on every request. The same shape
 * inventory uses, for the same reason.
 *
 * `customers` is a LEFT JOIN: most reviews have no account behind them,
 * and an inner join would return only the handful that do.
 */
const SELECT_ROW = `
  SELECT
    r.id,
    r.product_id,
    r.customer_id,
    r.author_name,
    r.rating,
    r.title,
    r.body,
    r.published,
    r.created_at,
    r.updated_at,
    p.name        AS product_name,
    p.slug        AS product_slug,
    p.active      AS product_active,
    c.name        AS customer_name,
    c.email       AS customer_email,
    img.image_url AS product_image_url
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN customers c ON c.id = r.customer_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.position ASC, pi.created_at ASC
    LIMIT 1
  ) img ON TRUE
`;

/**
 * Builds the shared WHERE clause.
 *
 * @returns {{clause: string, values: unknown[]}} `clause` includes the
 *          leading WHERE, or is empty when nothing was filtered.
 */
const buildFilters = ({
  productId = null,
  rating = null,
  published = null,
  search = null,
} = {}) => {
  const conditions = [];
  const values = [];

  if (productId) {
    values.push(productId);
    conditions.push(`r.product_id = $${values.length}::uuid`);
  }

  if (rating) {
    values.push(rating);
    conditions.push(`r.rating = $${values.length}::smallint`);
  }

  // `null` means "either", which is why this tests against null rather
  // than against falsiness — `published=false` is a filter the admin
  // screen offers, and treating it as "no filter" would hide exactly
  // the rows somebody went looking for.
  if (published !== null && published !== undefined) {
    values.push(published);
    conditions.push(`r.published = $${values.length}::boolean`);
  }

  if (search) {
    values.push(`%${search}%`);
    const like = `$${values.length}`;

    conditions.push(
      `(r.author_name ILIKE ${like}
        OR r.title ILIKE ${like}
        OR r.body ILIKE ${like}
        OR p.name ILIKE ${like})`,
    );
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
  };
};

export const ReviewRepository = {
  // ==========================================================
  // READ
  // ==========================================================

  async findAll({
    productId = null,
    rating = null,
    published = null,
    search = null,
    sort = DEFAULT_SORT,
    page = 1,
    limit = 25,
  } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const { clause, values } = buildFilters({
      productId,
      rating,
      published,
      search,
    });

    const text = `
      ${SELECT_ROW}
      ${clause}
      ORDER BY ${reviewSortSql(sort)}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;

    // The count joins products too, because the search filter reaches
    // through to the product's name — counting without the join would
    // reference a table the clause mentions and fail.
    const countText = `
      SELECT COUNT(*)::INTEGER AS count
      FROM reviews r
      JOIN products p ON p.id = r.product_id
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
      throw handleDatabaseError(error, "findAll", { productId, sort });
    }
  },

  async findById(id) {
    const text = `
      ${SELECT_ROW}
      WHERE r.id = $1::uuid
      LIMIT 1
    `;

    try {
      const result = await query(text, [id]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { reviewId: id });
    }
  },

  /**
   * How a set of reviews scores, in one row.
   *
   * Published only. The average is what a shopper would see, and
   * folding in the hidden ones would print a figure that matches none
   * of the stars underneath it.
   *
   * Rounded to one decimal in SQL rather than in the client, so the
   * admin screen and the storefront cannot round it differently.
   */
  async ratingSummary({ productId = null } = {}) {
    const values = [];
    let clause = "";

    if (productId) {
      values.push(productId);
      clause = `WHERE r.product_id = $${values.length}::uuid`;
    }

    // One scan, with the published/hidden split expressed as FILTERs
    // rather than as a WHERE plus a second unfiltered subquery. The
    // subquery version returned a shop-wide total beside a per-product
    // average, which is two different questions printed as one answer.
    const text = `
      SELECT
        COUNT(*)::INTEGER AS total_reviews,
        COUNT(*) FILTER (WHERE r.published)::INTEGER     AS published_reviews,
        COUNT(*) FILTER (WHERE NOT r.published)::INTEGER AS hidden_reviews,

        COALESCE(
          ROUND((AVG(r.rating) FILTER (WHERE r.published)), 1),
          0
        )::NUMERIC(3,1) AS average_rating,

        COUNT(*) FILTER (WHERE r.published AND r.rating = 5)::INTEGER AS five,
        COUNT(*) FILTER (WHERE r.published AND r.rating = 4)::INTEGER AS four,
        COUNT(*) FILTER (WHERE r.published AND r.rating = 3)::INTEGER AS three,
        COUNT(*) FILTER (WHERE r.published AND r.rating = 2)::INTEGER AS two,
        COUNT(*) FILTER (WHERE r.published AND r.rating = 1)::INTEGER AS one
      FROM reviews r
      ${clause}
    `;

    try {
      const result = await query(text, values);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "ratingSummary", { productId });
    }
  },

  // ==========================================================
  // WRITE
  // ==========================================================

  async create({
    productId,
    customerId = null,
    authorName,
    rating,
    title = null,
    body = null,
    published = true,
  }) {
    const text = `
      INSERT INTO reviews (
        product_id, customer_id, author_name, rating, title, body, published
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::smallint, $5, $6, $7::boolean)
      RETURNING id
    `;

    try {
      const result = await query(text, [
        productId,
        customerId,
        authorName,
        rating,
        title,
        body,
        published,
      ]);

      const id = result.rows[0]?.id;

      logger.info("Review created", { reviewId: id, productId, rating });

      // Read back through the join so the caller receives the same
      // shape the list renders, rather than a bare row it would have to
      // special-case.
      return await ReviewRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "create", { productId });
    }
  },

  /**
   * A partial update.
   *
   * COALESCE against the parameter rather than building the SET list
   * from whichever keys were sent: one statement, one plan, and no way
   * for an empty patch to produce `SET` with nothing after it. The cost
   * is that a column cannot be set back to NULL through here — which is
   * why `title` and `body` take the empty string for "clear this", and
   * the service converts.
   *
   * @returns {object|null} the updated row, or null when no review has
   *          that id
   */
  async update(id, { customerId, authorName, rating, title, body, published }) {
    const text = `
      UPDATE reviews
      SET
        customer_id = COALESCE($2::uuid, customer_id),
        author_name = COALESCE($3, author_name),
        rating      = COALESCE($4::smallint, rating),
        title       = COALESCE($5, title),
        body        = COALESCE($6, body),
        published   = COALESCE($7::boolean, published),
        updated_at  = NOW()
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(text, [
        id,
        customerId ?? null,
        authorName ?? null,
        rating ?? null,
        title ?? null,
        body ?? null,
        published ?? null,
      ]);

      if (result.rowCount === 0) return null;

      logger.info("Review updated", { reviewId: id });

      return await ReviewRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "update", { reviewId: id });
    }
  },

  /**
   * Detaches a review from a customer account, or clears its prose.
   *
   * The one write COALESCE cannot express, kept separate rather than
   * given to `update` as a set of "null means clear" flags — that
   * reading is exactly the ambiguity COALESCE exists to avoid.
   *
   * @param {string[]} columns  a subset of ['customer_id','title','body'],
   *                            named by the service, never by a caller
   */
  async clearColumns(id, columns = []) {
    if (columns.length === 0) return await ReviewRepository.findById(id);

    const assignments = columns.map((column) => `${column} = NULL`).join(", ");

    const text = `
      UPDATE reviews
      SET ${assignments}, updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id
    `;

    try {
      const result = await query(text, [id]);
      if (result.rowCount === 0) return null;

      return await ReviewRepository.findById(id);
    } catch (error) {
      throw handleDatabaseError(error, "clearColumns", { reviewId: id, columns });
    }
  },

  /**
   * A hard delete, unlike customers and products.
   *
   * A review is the shop's own published opinion of its own product, not
   * a record of something that happened between two parties. Nothing
   * points at it, nothing needs it to have existed, and an admin who
   * deletes one means it. Hiding without deleting is what `published`
   * is for, and it is the default gesture on the screen.
   *
   * @returns {boolean} false when no review had that id
   */
  async remove(id) {
    try {
      const result = await query("DELETE FROM reviews WHERE id = $1::uuid", [id]);

      if (result.rowCount === 0) return false;

      logger.info("Review deleted", { reviewId: id });
      return true;
    } catch (error) {
      throw handleDatabaseError(error, "remove", { reviewId: id });
    }
  },
};
