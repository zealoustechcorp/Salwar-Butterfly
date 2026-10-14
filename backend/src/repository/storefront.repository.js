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
import { COLOUR_GROUP, FIT_GROUP } from "../config/attribute.groups.js";
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
// CATEGORY VISIBILITY
// ============================================================
//
// A product is only on sale while its category is. `p.active` alone is
// not enough: the admin takes a whole collection down by switching the
// category off, or deletes it (a soft delete — the row and its
// products stay), and before this every product inside it stayed on
// the grid, reachable by URL and counted in the hero's rating, under a
// category tile that had already disappeared.
//
// One fragment, used by every public read that names a product — the
// catalogue, the review endpoints, and the product link on a banner or
// story — so "is this piece public" has one answer everywhere.
// EXISTS rather than a JOIN so it cannot multiply rows.

const PRODUCT_CATEGORY_VISIBLE = `
  EXISTS (
    SELECT 1 FROM categories pc
    WHERE pc.id = p.category_id
      AND pc.deleted_at IS NULL
      AND pc.active = TRUE
  )
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
    -- How the piece is cut, and the only reason the public reader looks
    -- inside \`attributes\` at all. It names a row in \`size_charts\`, so
    -- the storefront can print the one table that applies to this piece
    -- instead of every table the shop publishes.
    --
    -- One key, not the whole document: \`attributes\` is a free-form bag
    -- an admin can add to, and selecting it whole would put whatever
    -- they add next on a public endpoint. NULL where no fit is
    -- recorded, which is the "show them all" case.
    p.attributes->>'${FIT_GROUP}'    AS fit,
    COALESCE(sizes.rows, '[]'::json) AS sizes,
    COALESCE(sizes.total_stock, 0)   AS stock,
    COALESCE(colourways.rows, '[]'::json) AS colours,
    COALESCE(by_colour.rows, '[]'::json)  AS variants,
    photos.image_url                 AS image,
    photos.image_url_2               AS image2,
    COALESCE(photos.images, '[]'::json) AS images,
    COALESCE(rating.count, 0)        AS rating_count,
    COALESCE(rating.sum, 0)          AS rating_sum,
    rating.average                   AS rating_average
  FROM products p
  -- One entry per SIZE, not per variant row.
  --
  -- Since colour arrived (migration 015) a product can hold several rows
  -- for one size — "M in Maroon", "M in Teal" — and aggregating the rows
  -- directly would hand the storefront two chips both labelled M. So the
  -- rows are folded by size first: stock is summed across the colourways,
  -- and the variant_id carried is the first by position.
  --
  -- The folded rows are what a card, the size filter and "4 of 6 sizes
  -- in stock" read. Their variant_id is only orderable for a product
  -- with no colours, where there is exactly one row per size and the
  -- fold is a no-op. A product sold by colour is ordered from "variants"
  -- below instead, against the (size, colour) the shopper picked — the
  -- first-by-position id here would book every colour against one
  -- arbitrary colourway's shelf.
  LEFT JOIN LATERAL (
    SELECT
      json_agg(
        json_build_object(
          'variant_id', by_size.variant_id,
          'size',       by_size.size,
          'stock',      by_size.stock
        )
        ORDER BY by_size.position ASC, by_size.size ASC
      ) AS rows,
      SUM(by_size.stock)::INTEGER AS total_stock
    FROM (
      SELECT
        v.size,
        MIN(v.position)                        AS position,
        SUM(v.stock_quantity)::INTEGER         AS stock,
        (ARRAY_AGG(v.id ORDER BY v.position ASC, v.colour ASC))[1] AS variant_id
      FROM product_variants v
      WHERE v.product_id = p.id
        AND v.active = TRUE
      GROUP BY v.size
    ) by_size
  ) sizes ON TRUE

  -- The colourways on sale: the swatches on the detail page and the dots
  -- on a card. Empty for a product not sold by colour: '' is the "no
  -- colour" sentinel and is filtered out rather than surfacing as a
  -- blank chip.
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        json_agg(
          json_build_object('name', colours.colour, 'hex', colours.hex)
          ORDER BY colours.position ASC, colours.colour ASC
        ),
        '[]'::json
      ) AS rows
    FROM (
      SELECT v.colour, MIN(v.position) AS position, MIN(reg.hex) AS hex
      FROM product_variants v
      LEFT JOIN product_attribute_values reg
        ON reg.group_name = '${COLOUR_GROUP}' AND reg.value = v.colour
      WHERE v.product_id = p.id
        AND v.active = TRUE
        AND v.colour <> ''
      GROUP BY v.colour
    ) colours
  ) colourways ON TRUE

  -- Every sellable (size, colour) with its own shelf count, for the
  -- colour picker. Only filled for a product that has colours: one with
  -- none is fully described by \`sizes\` above, and repeating its rows
  -- here would double what every card in the grid downloads for nothing.
  LEFT JOIN LATERAL (
    SELECT
      json_agg(
        json_build_object(
          'variant_id', v.id,
          'size',       v.size,
          'colour',     v.colour,
          'stock',      v.stock_quantity
        )
        ORDER BY v.position ASC, v.colour ASC
      ) AS rows
    FROM product_variants v
    WHERE v.product_id = p.id
      AND v.active = TRUE
      AND v.colour <> ''
  ) by_colour ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      MAX(i.image_url) FILTER (WHERE i.rn = 1) AS image_url,
      MAX(i.image_url) FILTER (WHERE i.rn = 2) AS image_url_2,
      -- The whole gallery, in the shop's order, for the product page.
      -- The two columns above stay for the cards, which only ever show
      -- the cover and a hover shot.
      JSON_AGG(i.image_url ORDER BY i.rn) AS images
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
  -- The star total is not shown anywhere. It is what lets the service
  -- add up a shop-wide average exactly, from these same rows, without a
  -- second query: averaging the per-product averages would weight a
  -- piece with one review the same as one with twenty, and re-averaging
  -- the rounded ones would drift besides. Summing the stars and dividing
  -- by the count is the only arithmetic that gives the same answer as
  -- counting every review at once.
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::INTEGER              AS count,
      SUM(r.rating)::INTEGER         AS sum,
      ROUND(AVG(r.rating), 1)::NUMERIC(3,1) AS average
    FROM reviews r
    WHERE r.product_id = p.id
      AND r.published
  ) rating ON TRUE

  WHERE p.active = TRUE
    AND ${PRODUCT_CATEGORY_VISIBLE}
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
    AND ${PRODUCT_CATEGORY_VISIBLE}
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
    AND ${PRODUCT_CATEGORY_VISIBLE}
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
      AND ${PRODUCT_CATEGORY_VISIBLE}
  ) AS found
`;

// ============================================================
// SIZE CHARTS (F-06)
// ============================================================
//
// Six columns, and the three that are missing are the point: `id`,
// `position` and `active` are the admin screen's business. A shopper
// reading a size chart has no use for the id of the row it came from,
// the order the shop chose to print them in is already expressed by the
// ORDER BY, and `active` would tell an anonymous reader how many charts
// the shop has taken down.
//
// `active` still appears in the WHERE, which is the whole difference
// between this reader and the admin one next door: a chart the shop has
// withdrawn cannot be reached here at all, rather than being fetched and
// filtered somewhere downstream.

const SIZE_CHARTS_SQL = `
  SELECT
    sc.fit,
    sc.title,
    sc.unit,
    sc.column_keys,
    sc.measurements
  FROM size_charts sc
  WHERE sc.active
  ORDER BY sc.position ASC, sc.fit ASC
`;

// ============================================================
// BANNERS (F-06)
// ============================================================
//
// Three columns, and the four that are missing are the point.
//
// `id` and `position` are the admin screen's business — the rotation
// order is already expressed by the ORDER BY, and a shopper has no use
// for the id of the row a photograph came from. `active` would tell an
// anonymous reader how many banners the shop has taken down.
//
// `image_public_id` is the one that would actually matter. It is
// R2's handle for the file and the only argument its destroy
// call accepts, so publishing it on an endpoint with no token in front
// of it would put the delete key for the shop's own artwork in the page
// source. The admin API next door returns it because the admin screen is
// what deletes banners; this reader must never see it.
//
// `product_id` is the exception, added with 020, and it is here for the
// same reason it is in CUSTOMER_STORIES_SQL below: a slide that names a
// piece is a slide that links to it, and the id is what the link is
// built from. Product ids are already in the catalogue this same reader
// serves and in every product URL on the site.
//
// The join is filtered by `p.active`, so a banner pointing at a piece
// the shop has taken off sale comes back with a null name and renders as
// a photograph that does not link anywhere. The slide itself still
// shows: the artwork is the shop's and is still worth looking at, and a
// first fold that empties itself because a run sold out would be a worse
// answer than one that simply stops being clickable.

const BANNERS_SQL = `
  SELECT
    b.image,
    b.product_id,
    p.name   AS product_name,
    p.active AS product_active
  FROM banners b
  LEFT JOIN products p
    ON p.id = b.product_id
   AND p.active = TRUE
   AND ${PRODUCT_CATEGORY_VISIBLE}
  WHERE b.active
  ORDER BY b.position ASC, b.created_at ASC, b.id ASC
`;

// ============================================================
// CUSTOMER STORIES (F-06.08)
// ============================================================
//
// Five columns, and the same four are missing as everywhere else here:
// the story's own id, its position, its published flag and its
// R2 object key.
//
// `product_id` is the exception, and it is here because it is the
// point: a story that names a piece is a card that links to it, and the
// id is what the link is built from. It is not a disclosure — product
// ids are already in the catalogue and in every product URL.
//
// The join is filtered by `p.active`, so a story pointing at a piece the
// shop has taken off sale comes back with a null name and is rendered as
// a card that does not link anywhere. The story itself is still shown:
// what a customer said about their order does not stop being true when
// the run sells out.
//
// LIMIT rather than the whole table. The shop may keep sixty; a visitor
// is served the first N by the shop's own order, which is its ordering
// decision being honoured rather than a truncation it did not choose.

const CUSTOMER_STORIES_SQL = `
  SELECT
    cs.customer_name,
    cs.body,
    cs.image,
    cs.product_id,
    p.name   AS product_name,
    p.active AS product_active
  FROM customer_stories cs
  LEFT JOIN products p
    ON p.id = cs.product_id
   AND p.active = TRUE
   AND ${PRODUCT_CATEGORY_VISIBLE}
  WHERE cs.published
  ORDER BY cs.position ASC, cs.created_at DESC, cs.id ASC
  LIMIT $1
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

  /** The charts the shop currently publishes, in print order. */
  async sizeCharts() {
    try {
      const result = await query(SIZE_CHARTS_SQL);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "sizeCharts");
    }
  },

  /** The slides the carousel is currently showing, in rotation order. */
  async banners() {
    try {
      const result = await query(BANNERS_SQL);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "banners");
    }
  },

  /** The stories the shop is publishing, in the order it chose. */
  async customerStories(limit) {
    try {
      const result = await query(CUSTOMER_STORIES_SQL, [limit]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "customerStories");
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
