// src/repository/storefront.repository.js
//
// The public catalogue read model (F-06 Product Browsing & Search).
//
// This is the only repository in the project that answers to an
// unauthenticated caller, so it is deliberately narrow: two SELECTs, no
// writes, no `deleted_at` rows, no inactive rows, and no column that the
// shop would not print on a price tag. Cost, supplier, internal notes and
// the admin's own columns are not absent by accident — a public reader
// that selects `p.*` grows a leak the first time someone adds a column.
//
// The queries below are the ones `scripts/exportStorefront.js` used to run
// to build the committed snapshot. That script existed only because there
// was no public reader; now that there is one, the SQL lives here and the
// storefront reads it over HTTP instead of importing a JSON file that went
// stale the moment stock moved.
//
// Both queries use LATERALs rather than joins for the same reason the
// export did: a product with six sizes and two photos would otherwise come
// back twelve times and have to be reassembled in JavaScript.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation) => {
  logger.error(`Storefront repository error: ${operation}`, {
    operation,
    code: error?.code,
    message: error?.message,
  });

  return error;
};

// ============================================================
// CATEGORIES
// ============================================================
//
// Fetched whole and counted in the service, against the products that
// actually survived the photo filter. Counting in SQL would count rows
// the service then drops, and a tile promising seventeen pieces that
// opens on an empty grid is worse than no tile at all.

const CATEGORIES_SQL = `
  SELECT c.id, c.name, c.image
  FROM categories c
  WHERE c.deleted_at IS NULL
    AND c.active = TRUE
  ORDER BY c.name ASC
`;

// ============================================================
// PRODUCTS
// ============================================================
//
// `stock` is the product-level total the cards use for "only N left";
// the per-size counts underneath are what the size chips read.
//
// Every size carries its `variant_id`. That is the whole point of this
// shape: a bag line is ordered against a product_variants.id, and a size
// label alone identifies nothing checkout can sell.

const PRODUCTS_SQL = `
  SELECT
    p.id,
    p.name,
    p.current_price,
    p.base_price,
    p.category_id,
    p.created_at,
    COALESCE(sizes.rows, '[]'::json) AS sizes,
    COALESCE(sizes.total_stock, 0)   AS stock,
    photos.image_url                 AS image,
    photos.image_url_2               AS image2,
    COALESCE(rating.count, 0)        AS rating_count,
    rating.average                   AS rating_average
  FROM products p
  LEFT JOIN LATERAL (
    SELECT
      json_agg(
        json_build_object(
          'variant_id', v.id,
          'size',       v.size,
          'stock',      v.stock_quantity
        )
        ORDER BY v.position ASC, v.size ASC
      ) AS rows,
      SUM(v.stock_quantity)::INTEGER AS total_stock
    FROM product_variants v
    WHERE v.product_id = p.id
      AND v.active = TRUE
  ) sizes ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      MAX(i.image_url) FILTER (WHERE i.rn = 1) AS image_url,
      MAX(i.image_url) FILTER (WHERE i.rn = 2) AS image_url_2
    FROM (
      SELECT
        pi.image_url,
        ROW_NUMBER() OVER (ORDER BY pi.position ASC, pi.created_at ASC) AS rn
      FROM product_images pi
      WHERE pi.product_id = p.id
    ) i
  ) photos ON TRUE

  -- Ratings (F-06.08). Published reviews only: the published column is
  -- the shop's switch for taking one off the storefront, and a hidden
  -- review that still moved the average would make that switch a lie.
  --
  -- The average is left NULL rather than defaulted to 0 when a piece has
  -- no reviews. Zero is a rating — the worst one — and a card cannot tell
  -- it apart from "nobody has said anything yet". The count is what the
  -- frontend tests before drawing stars at all.
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::INTEGER              AS count,
      ROUND(AVG(r.rating), 1)::NUMERIC(3,1) AS average
    FROM reviews r
    WHERE r.product_id = p.id
      AND r.published
  ) rating ON TRUE

  WHERE p.active = TRUE
  ORDER BY p.created_at DESC, p.id DESC
`;

// ============================================================
// REVIEWS (F-06.08)
// ============================================================
//
// The public shape of a review, and it is deliberately four columns.
//
// `customer_id` is not here, and neither is the customer's email or the
// `published` flag. The first two are somebody's personal data attached
// to a public document; the third would tell an anonymous reader how
// many reviews the shop has chosen not to show, which is the shop's own
// business. The admin API next door returns all three — that is the
// difference between the two readers, and it is enforced by this column
// list rather than by a filter somewhere downstream.

const REVIEWS_SQL = `
  SELECT
    r.id,
    r.author_name,
    r.rating,
    r.title,
    r.body,
    r.created_at
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE r.product_id = $1::uuid
    AND r.published
    AND p.active = TRUE
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT $2
`;

/**
 * The score for one piece, and how it breaks down.
 *
 * Counted over the same rows the list above returns, so the stars, the
 * bars and the reviews underneath them cannot disagree.
 */
const RATING_SQL = `
  SELECT
    COUNT(*)::INTEGER AS count,
    COALESCE(ROUND(AVG(r.rating), 1), 0)::NUMERIC(3,1) AS average,
    COUNT(*) FILTER (WHERE r.rating = 5)::INTEGER AS five,
    COUNT(*) FILTER (WHERE r.rating = 4)::INTEGER AS four,
    COUNT(*) FILTER (WHERE r.rating = 3)::INTEGER AS three,
    COUNT(*) FILTER (WHERE r.rating = 2)::INTEGER AS two,
    COUNT(*) FILTER (WHERE r.rating = 1)::INTEGER AS one
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE r.product_id = $1::uuid
    AND r.published
    AND p.active = TRUE
`;

/**
 * Whether a piece is one the public may ask about at all.
 *
 * Separate from the rating query because the two answer different
 * questions: a product that exists and has no reviews is a 200 with an
 * empty list, and a product that does not exist — or has been taken off
 * sale — is a 404. One query cannot tell those apart, since both return
 * a count of zero.
 */
const PRODUCT_VISIBLE_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = $1::uuid
      AND p.active = TRUE
  ) AS found
`;

export const StorefrontRepository = {
  async categories() {
    try {
      const result = await query(CATEGORIES_SQL);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "categories");
    }
  },

  async products() {
    try {
      const result = await query(PRODUCTS_SQL);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "products");
    }
  },

  // ==========================================================
  // REVIEWS (F-06.08)
  // ==========================================================

  /** Whether the public may ask about this piece at all. */
  async productIsVisible(productId) {
    try {
      const result = await query(PRODUCT_VISIBLE_SQL, [productId]);
      return Boolean(result.rows[0]?.found);
    } catch (error) {
      throw handleDatabaseError(error, "productIsVisible");
    }
  },

  /**
   * Published reviews for one piece, newest first.
   *
   * Capped rather than paginated. A boutique piece collects a handful of
   * reviews, not a thread, and a "load more" control that never appears
   * is worth less than the cap being honest about itself — the count
   * from `productRating` is returned alongside, so a page can say
   * "showing 50 of 63" if it ever needs to.
   */
  async reviewsFor(productId, limit) {
    try {
      const result = await query(REVIEWS_SQL, [productId, limit]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "reviewsFor");
    }
  },

  async productRating(productId) {
    try {
      const result = await query(RATING_SQL, [productId]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "productRating");
    }
  },
};
