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
    photos.image_url_2               AS image2
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
  WHERE p.active = TRUE
  ORDER BY p.created_at DESC, p.id DESC
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
};
