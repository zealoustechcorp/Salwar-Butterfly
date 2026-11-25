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
// The product query aggregates each child table in its own derived table,
// grouped by product_id, rather than joining the children directly — for
// the same reason the export used LATERALs: a product with six sizes and
// two photos would otherwise come back twelve times and have to be
// reassembled in JavaScript. (MariaDB has no LATERAL, and a derived table
// cannot refer to the outer row, so each one aggregates every product and
// is joined on product_id.)
//
// Tie-breakers on an id compare it as text (CAST(… AS CHAR)): MariaDB
// sorts its UUID type in a different byte order from Postgres, and
// products and order lines written in one transaction share a created_at,
// so the id really does decide their order.

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
    p.slug,
    p.name,
    -- The admin's own copy about the piece, printed on the product page.
    -- Written to be public, like the name, so it belongs here. NULL where
    -- the shop has not written one, and the page then shows no section.
    p.description,
    p.current_price,
    p.base_price,
    p.category_id,
    p.created_at,
    -- The admin's "Featured" switch: the pieces the home page's Explore
    -- collections section shows. Already shown to shoppers as a choice the
    -- shop made in public, so nothing private.
    p.is_featured,
    -- How the piece is cut, and the only reason the public reader looks
    -- inside \`attributes\` at all. It names a row in \`size_charts\`, so
    -- the storefront can print the one table that applies to this piece
    -- instead of every table the shop publishes.
    --
    -- One key, not the whole document: \`attributes\` is a free-form bag
    -- an admin can add to, and selecting it whole would put whatever
    -- they add next on a public endpoint. NULL where no fit is
    -- recorded, which is the "show them all" case.
    JSON_VALUE(p.attributes, '$.${FIT_GROUP}') AS fit,
    -- __json: db.js parses these back into arrays.
    COALESCE(sizes.items, JSON_ARRAY())      AS sizes__json,
    COALESCE(sizes.total_stock, 0)           AS stock,
    COALESCE(colourways.items, JSON_ARRAY()) AS colours__json,
    COALESCE(by_colour.items, JSON_ARRAY())  AS variants__json,
    photos.image_url                         AS image,
    photos.image_url_2                       AS image2,
    COALESCE(photos.images, JSON_ARRAY())    AS images__json,
    COALESCE(rating.review_count, 0)         AS rating_count,
    COALESCE(rating.star_sum, 0)             AS rating_sum,
    rating.average                           AS rating_average
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
  LEFT JOIN (
    SELECT
      by_size.product_id,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'variant_id', by_size.variant_id,
          'size',       by_size.size,
          'stock',      by_size.stock
        )
        ORDER BY by_size.position ASC, by_size.size ASC
      ) AS items,
      CAST(SUM(by_size.stock) AS SIGNED) AS total_stock
    FROM (
      SELECT
        v.product_id,
        v.size,
        MIN(v.position)                        AS position,
        CAST(SUM(v.stock_quantity) AS SIGNED)  AS stock,
        JSON_VALUE(
          JSON_ARRAYAGG(v.id ORDER BY v.position ASC, v.colour ASC),
          '$[0]'
        )                                      AS variant_id
      FROM product_variants v
      WHERE v.active = TRUE
      GROUP BY v.product_id, v.size
    ) by_size
    GROUP BY by_size.product_id
  ) sizes ON sizes.product_id = p.id

  -- The colourways on sale: the swatches on the detail page and the dots
  -- on a card. Empty for a product not sold by colour: '' is the "no
  -- colour" sentinel and is filtered out rather than surfacing as a
  -- blank chip.
  LEFT JOIN (
    SELECT
      colours.product_id,
      JSON_ARRAYAGG(
        JSON_OBJECT('name', colours.colour, 'hex', colours.hex)
        ORDER BY colours.position ASC, colours.colour ASC
      ) AS items
    FROM (
      SELECT v.product_id, v.colour, MIN(v.position) AS position, MIN(reg.hex) AS hex
      FROM product_variants v
      LEFT JOIN product_attribute_values reg
        ON reg.group_name = '${COLOUR_GROUP}' AND reg.value = v.colour
      WHERE v.active = TRUE
        AND v.colour <> ''
      GROUP BY v.product_id, v.colour
    ) colours
    GROUP BY colours.product_id
  ) colourways ON colourways.product_id = p.id

  -- Every sellable (size, colour) with its own shelf count, for the
  -- colour picker. Only filled for a product that has colours: one with
  -- none is fully described by \`sizes\` above, and repeating its rows
  -- here would double what every card in the grid downloads for nothing.
  LEFT JOIN (
    SELECT
      v.product_id,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'variant_id', v.id,
          'size',       v.size,
          'colour',     v.colour,
          'stock',      v.stock_quantity
        )
        ORDER BY v.position ASC, v.colour ASC
      ) AS items
    FROM product_variants v
    WHERE v.active = TRUE
      AND v.colour <> ''
    GROUP BY v.product_id
  ) by_colour ON by_colour.product_id = p.id
  LEFT JOIN (
    SELECT
      i.product_id,
      MAX(CASE WHEN i.rn = 1 THEN i.image_url END) AS image_url,
      MAX(CASE WHEN i.rn = 2 THEN i.image_url END) AS image_url_2,
      -- The whole gallery, in the shop's order, for the product page.
      -- The two columns above stay for the cards, which only ever show
      -- the cover and a hover shot.
      JSON_ARRAYAGG(i.image_url ORDER BY i.rn) AS images
    FROM (
      SELECT
        pi.product_id,
        pi.image_url,
        ROW_NUMBER() OVER (
          PARTITION BY pi.product_id
          ORDER BY pi.position ASC, pi.created_at ASC
        ) AS rn
      FROM product_images pi
    ) i
    GROUP BY i.product_id
  ) photos ON photos.product_id = p.id

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
  LEFT JOIN (
    SELECT
      r.product_id,
      COUNT(*)                                      AS review_count,
      CAST(SUM(r.rating) AS SIGNED)                 AS star_sum,
      CAST(ROUND(AVG(r.rating), 1) AS DECIMAL(3,1)) AS average
    FROM reviews r
    WHERE r.published
    GROUP BY r.product_id
  ) rating ON rating.product_id = p.id

  WHERE p.active = TRUE
    AND ${PRODUCT_CATEGORY_VISIBLE}
  ORDER BY p.created_at DESC, CAST(p.id AS CHAR) DESC
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
  WHERE r.product_id = $1
    AND r.published
    AND p.active = TRUE
    AND ${PRODUCT_CATEGORY_VISIBLE}
  ORDER BY r.created_at DESC, CAST(r.id AS CHAR) DESC
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
    COUNT(*) AS count,
    CAST(COALESCE(ROUND(AVG(r.rating), 1), 0) AS DECIMAL(3,1)) AS average,
    COUNT(CASE WHEN r.rating = 5 THEN 1 END) AS five,
    COUNT(CASE WHEN r.rating = 4 THEN 1 END) AS four,
    COUNT(CASE WHEN r.rating = 3 THEN 1 END) AS three,
    COUNT(CASE WHEN r.rating = 2 THEN 1 END) AS two,
    COUNT(CASE WHEN r.rating = 1 THEN 1 END) AS one
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE r.product_id = $1
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
    WHERE p.id = $1
      AND p.active = TRUE
      AND ${PRODUCT_CATEGORY_VISIBLE}
  ) AS found__bool
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
    p.slug   AS product_slug,
    p.active AS product_active
  FROM banners b
  LEFT JOIN products p
    ON p.id = b.product_id
   AND p.active = TRUE
   AND ${PRODUCT_CATEGORY_VISIBLE}
  WHERE b.active
  ORDER BY b.position ASC, b.created_at ASC, CAST(b.id AS CHAR) ASC
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
    p.slug   AS product_slug,
    p.active AS product_active
  FROM customer_stories cs
  LEFT JOIN products p
    ON p.id = cs.product_id
   AND p.active = TRUE
   AND ${PRODUCT_CATEGORY_VISIBLE}
  WHERE cs.published
  ORDER BY cs.position ASC, cs.created_at DESC, CAST(cs.id AS CHAR) ASC
  LIMIT $1
`;

// ============================================================
// HOME SECTIONS (F-06)
// ============================================================
//
// Three columns and an id list: the two fixed sections (029), Best sellers
// and the custom one, with their name, description and key. Their id and
// position are the admin screen's business; the ORDER BY already says the
// order. The switch and the date window are still applied, though the admin
// screen no longer sets either.
//
// The picks are filtered the way every other product here is — on sale,
// in a visible category — and a shelf left with none is dropped, so the
// storefront never has to decide what an empty shelf means.

const HOME_SECTIONS_SQL = `
  SELECT
    s.title,
    s.subtitle,
    s.slug,
    picked.product_ids AS product_ids__json
  FROM home_sections s
  -- An inner join: a section with no visible picks has no row here and
  -- is dropped, as the Postgres version's "product_ids IS NOT NULL" did.
  JOIN (
    SELECT
      hsp.section_id,
      JSON_ARRAYAGG(p.id ORDER BY hsp.position ASC) AS product_ids
    FROM home_section_products hsp
    JOIN products p ON p.id = hsp.product_id
    WHERE p.active = TRUE
      AND ${PRODUCT_CATEGORY_VISIBLE}
    GROUP BY hsp.section_id
  ) picked ON picked.section_id = s.id
  WHERE s.slug = 'custom'
    AND s.active
    AND (s.starts_at IS NULL OR s.starts_at <= NOW(6))
    AND (s.ends_at IS NULL OR s.ends_at > NOW(6))
  ORDER BY s.position ASC, s.created_at ASC, CAST(s.id AS CHAR) ASC
`;

// ============================================================
// RECENT ORDERS POP-UP (F-09.09)
// ============================================================
//
// The orders behind the "Someone from Chennai just bought…" pop-up.
//
// The column list is the privacy decision, so read it twice: the shipping
// CITY and nothing else about the customer. No name, phone, email, street,
// PIN code, order number, amount or id. The shop chose "Someone from
// <city>", and a reader that selected `o.*` would publish the address book
// the first time somebody mapped one more field.
//
// Eligible orders: paid (not pending, failed, refunded or partly refunded)
// and not cancelled, paid within the shop's look-back window ($1 days).
//
// One card per order, however many pieces it holds. Only pieces still on
// sale in a visible category count, so no link on the pop-up opens a dead
// page, and a product counts once however many lines it has (two sizes,
// quantity 2): "+1 more" must never point back at the same page.
//
//   the piece    the first of those products the customer added;
//   more_count   how many others there are;
//   more         the next $3 of them, in the order they were added, each
//                with its name, slug and first photograph.
//
// An order whose every piece has since been taken down is skipped.
//
// Names, slugs and photographs are read live from the catalogue rather
// than from the order line's snapshot, so the pop-up matches the page it
// links to.

//
// The city is title-cased in JavaScript (see recentOrders): MariaDB has no
// INITCAP.

const RECENT_ORDERS_SQL = `
  WITH eligible AS (
    SELECT
      o.id,
      o.shipping_city,
      COALESCE(o.paid_at, o.placed_at) AS ordered_at
    FROM orders o
    WHERE o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND COALESCE(o.paid_at, o.placed_at) >= NOW(6) - INTERVAL $1 DAY
      AND NULLIF(TRIM(o.shipping_city), '') IS NOT NULL
  ),
  -- Each on-sale product once, at the first line it appears on (Postgres
  -- used DISTINCT ON), then numbered in the order the customer added them
  -- (ord) and counted per order.
  first_lines AS (
    SELECT
      line.order_id,
      line.product_id,
      ROW_NUMBER() OVER (
        PARTITION BY line.order_id
        ORDER BY line.created_at ASC, line.id_text ASC
      ) AS ord,
      COUNT(*) OVER (PARTITION BY line.order_id) AS piece_count
    FROM (
      SELECT
        oi.order_id,
        oi.product_id,
        oi.created_at,
        CAST(oi.id AS CHAR) AS id_text,
        ROW_NUMBER() OVER (
          PARTITION BY oi.order_id, oi.product_id
          ORDER BY oi.created_at ASC, CAST(oi.id AS CHAR) ASC
        ) AS rn
      FROM order_items oi
      JOIN eligible e ON e.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE p.active = TRUE
        AND ${PRODUCT_CATEGORY_VISIBLE}
    ) line
    WHERE line.rn = 1
  )
  SELECT
    TRIM(o.shipping_city) AS city,
    o.ordered_at          AS ordered_at,
    p.name                AS product_name,
    p.slug                AS product_slug,
    (
      SELECT pi.image_url
      FROM product_images pi
      WHERE pi.product_id = p.id
      ORDER BY pi.position ASC, pi.created_at ASC
      LIMIT 1
    )                     AS product_image,
    lead.piece_count - 1 AS more_count,
    (
      SELECT COALESCE(
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'name',  mp.name,
            'slug',  mp.slug,
            'image', (
              SELECT pi.image_url
              FROM product_images pi
              WHERE pi.product_id = mp.id
              ORDER BY pi.position ASC, pi.created_at ASC
              LIMIT 1
            )
          )
          ORDER BY m.ord
        ),
        JSON_ARRAY()
      )
      FROM first_lines m
      JOIN products mp ON mp.id = m.product_id
      WHERE m.order_id = o.id
        AND m.ord BETWEEN 2 AND $3 + 1
    )                     AS more__json
  FROM eligible o
  JOIN first_lines lead ON lead.order_id = o.id AND lead.ord = 1
  JOIN products p ON p.id = lead.product_id
  ORDER BY o.ordered_at DESC, CAST(o.id AS CHAR) DESC
  LIMIT $2
`;

/**
 * Postgres's INITCAP: the first letter or digit of every run of letters
 * and digits upper-cased, the rest lower-cased ("NEW delhi" → "New Delhi",
 * "port-blair" → "Port-Blair").
 */
const initcap = (text) => {
  let previousWasAlnum = false;
  let out = "";

  for (const ch of String(text)) {
    out += previousWasAlnum ? ch.toLowerCase() : ch.toUpperCase();
    previousWasAlnum = /[\p{L}\p{N}]/u.test(ch);
  }

  return out;
};

/** The pop-up's switch and timing (036). The public half of a settings row. */
const POPUP_SETTINGS_SQL = `
  SELECT enabled, lookback_days, display_mode, visible_seconds, gap_seconds
  FROM recent_order_popup_settings
  WHERE id = 1
`;

export const StorefrontRepository = {
  /** The pop-up's settings row, or null where 036 left none. */
  async popupSettings() {
    try {
      const result = await query(POPUP_SETTINGS_SQL);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "popupSettings");
    }
  },

  /**
   * Recent paid orders for the pop-up, newest first: a city, a piece, and
   * up to `moreLimit` of the order's other pieces with a count of them all.
   */
  async recentOrders(lookbackDays, limit, moreLimit) {
    try {
      const result = await query(RECENT_ORDERS_SQL, [
        Number(lookbackDays),
        Number(limit),
        Number(moreLimit),
      ]);
      return result.rows.map((row) => ({ ...row, city: initcap(row.city) }));
    } catch (error) {
      throw handleDatabaseError(error, "recentOrders");
    }
  },

  /** The live hand-picked shelves, in the shop's order. */
  async homeSections() {
    try {
      const result = await query(HOME_SECTIONS_SQL);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "homeSections");
    }
  },

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
