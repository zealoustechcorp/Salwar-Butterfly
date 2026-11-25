// src/repository/report.repository.js
//
// Dashboard and reports (F-11) — a read model with no table of its own.
//
// Everything here aggregates rows that other features already own:
// orders, order_items, products, categories, customers. Nothing is
// written, and nothing is cached. A rollup table would be the usual
// answer at scale, but it would also be a second copy of every number
// on this screen, free to drift from the first; a boutique's order
// history fits comfortably in a GROUP BY.
//
// What this file deliberately does *not* contain:
//
//   stock counts       InventoryRepository.summary() already computes
//                      them, from the one stock policy. Re-deriving
//                      them here would let the dashboard and the
//                      inventory screen disagree about the word "low".
//
//   the order report   OrderRepository.findAll() already filters by
//                      date range and returns lines with the header.
//                      F-11.03 is that query with a range on it, not a
//                      new one.
//
// The service composes those two with the aggregates below. Reuse over
// a second implementation, every time — a report that contradicts the
// screen it links to is worse than no report.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";
import {
  cancelledFilterSql,
  pipelineFilterSql,
  REPORT_TIMEZONE,
  revenueAmountSql,
  revenueFilterSql,
  soldFilterSql,
  topProductsSortSql,
} from "../config/report.policy.js";
// Every query below reads placed orders only. A checkout draft that was
// never paid is not a sale, and one the sweeper cancelled is not a
// cancellation — counting either would fill the dashboard with carts.
import { isPlacedSql } from "../config/order.policy.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Report repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    message: error?.message,
  });

  return error;
};

// ============================================================
// TIME BOUNDARIES
// ============================================================

/**
 * The shop's zone as a fixed UTC offset, for CONVERT_TZ.
 *
 * MariaDB on this host has no timezone tables loaded, so a named zone
 * ("Asia/Kolkata") makes CONVERT_TZ return NULL. India has no daylight
 * saving, so the offset is exact all year. Throws at load if the policy
 * names a zone this map does not know, rather than reporting NULLs.
 */
const UTC_OFFSETS = { "Asia/Kolkata": "+05:30" };
const REPORT_UTC_OFFSET = UTC_OFFSETS[REPORT_TIMEZONE];
if (!REPORT_UTC_OFFSET) {
  throw new Error(`report.repository: no UTC offset known for ${REPORT_TIMEZONE}`);
}

/** An instant (UTC DATETIME) → the shop's wall clock. `$1` is the offset. */
const toLocal = (expr) => `CONVERT_TZ(${expr}, '+00:00', $1)`;

/** The shop's wall clock (a DATE or DATETIME) → the UTC instant. */
const toInstant = (expr) => `CONVERT_TZ(CAST(${expr} AS DATETIME(6)), $1, '+00:00')`;

/**
 * Postgres's date_trunc for the three report periods, on a local wall
 * clock, returning a DATE. Weeks start on Monday, as date_trunc's did
 * (WEEKDAY() is 0 for Monday). `period` is the placeholder holding the
 * bound period name — never interpolated text — so an unknown value is
 * NULL rather than SQL.
 */
const truncLocal = (expr, period) => `
  CASE ${period}
    WHEN 'day'   THEN DATE(${expr})
    WHEN 'week'  THEN DATE(${expr}) - INTERVAL WEEKDAY(${expr}) DAY
    WHEN 'month' THEN DATE(${expr}) - INTERVAL (DAYOFMONTH(${expr}) - 1) DAY
  END`;

/** `date + n periods` — an INTERVAL unit cannot be a bound parameter. */
const addPeriods = (expr, n, period) => `
  CASE ${period}
    WHEN 'day'   THEN ${expr} + INTERVAL (${n}) DAY
    WHEN 'week'  THEN ${expr} + INTERVAL (${n}) WEEK
    WHEN 'month' THEN ${expr} + INTERVAL (${n}) MONTH
  END`;

/**
 * "Today", "this week", "this month" — as UTC instants, computed in the
 * shop's zone.
 *
 * The round trip through CONVERT_TZ twice is not redundant. The first
 * converts `now` into a wall clock in Coimbatore so the truncation cuts
 * the day where the shop does; the second converts that wall clock back
 * into an absolute instant so it can be compared against `placed_at`,
 * which is stored in UTC. Truncating in UTC instead would file an order
 * placed at 1am IST under yesterday.
 *
 * `$1` is the shop's UTC offset, bound as a parameter like any other value.
 */
const BOUNDS_CTE = `
  bounds AS (
    SELECT
      ${toInstant(truncLocal(toLocal("NOW(6)"), "'day'"))}   AS day_start,
      ${toInstant(truncLocal(toLocal("NOW(6)"), "'week'"))}  AS week_start,
      ${toInstant(truncLocal(toLocal("NOW(6)"), "'month'"))} AS month_start
  )
`;

/**
 * The four windows the dashboard tiles cover, and the boundary each one
 * starts at. `all_time` has no lower bound.
 */
const WINDOWS = [
  { key: "today", since: "b.day_start" },
  { key: "week", since: "b.week_start" },
  { key: "month", since: "b.month_start" },
  { key: "all_time", since: null },
];

/**
 * The same four measures for one window.
 *
 * Generated rather than typed out four times: sixteen near-identical
 * conditional aggregates is where a copy-paste slip hides, and the only
 * thing that varies between them is the boundary. Nothing interpolated
 * here comes from a caller — the window list is the frozen one above and
 * the predicates come from report.policy.js.
 */
const windowColumns = ({ key, since }) => {
  const within = since ? `o.placed_at >= ${since}` : "TRUE";

  return `
    COUNT(CASE WHEN ${within} THEN 1 END)
      AS ${key}_orders,

    COUNT(CASE WHEN ${within} AND ${cancelledFilterSql("o")} THEN 1 END)
      AS ${key}_cancelled,

    COUNT(CASE WHEN ${within} AND ${revenueFilterSql("o")} THEN 1 END)
      AS ${key}_paid_orders,

    CAST(COALESCE(
      SUM(CASE WHEN ${within} AND ${revenueFilterSql("o")} THEN ${revenueAmountSql("o")} END),
      0
    ) AS DECIMAL(12,2)) AS ${key}_revenue
  `;
};

export const ReportRepository = {
  // ==========================================================
  // DASHBOARD TILES
  // ==========================================================

  /**
   * Orders and revenue for today, this week, this month and all time
   * (F-11.02), plus what is still owed.
   *
   * One query rather than four, so every tile describes the same
   * instant. Four separate counts could straddle an order being placed
   * and show a month total that is smaller than the week inside it.
   *
   * `pipeline` is not revenue and is never added to it: orders placed
   * and not yet paid for. The stock is already held against them, so it
   * is what the shop stands to take if they all go through.
   */
  async orderTotals() {
    const text = `
      WITH ${BOUNDS_CTE},
      totals AS (
        SELECT
          ${WINDOWS.map(windowColumns).join(",\n")},

          COUNT(CASE WHEN ${pipelineFilterSql("o")} THEN 1 END)
            AS pipeline_orders,

          CAST(COALESCE(
            SUM(CASE WHEN ${pipelineFilterSql("o")} THEN o.total END),
            0
          ) AS DECIMAL(12,2)) AS pipeline_value

        FROM orders o
        CROSS JOIN bounds b
        WHERE ${isPlacedSql("o")}
      )
      SELECT t.*, b.day_start, b.week_start, b.month_start
      FROM totals t
      CROSS JOIN bounds b
    `;

    try {
      // An aggregate with no GROUP BY returns exactly one row even over
      // an empty table, so a shop with no orders yet reads as zeroes
      // rather than as a missing dashboard.
      const result = await query(text, [REPORT_UTC_OFFSET]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "orderTotals");
    }
  },

  /**
   * How much catalogue there is (F-11.04).
   *
   * Stock is not counted here — InventoryRepository.summary() owns that,
   * and owning it twice is how "low stock" comes to mean two things.
   * These are the flat counts that screen has no reason to compute.
   *
   * Independent scalar subqueries rather than joins: they count
   * different tables with no relationship worth expressing, and joining
   * them would multiply rows before counting them.
   */
  async catalogueTotals() {
    const text = `
      WITH ${BOUNDS_CTE}
      SELECT
        (SELECT COUNT(*) FROM products)                       AS products,
        (SELECT COUNT(*) FROM products WHERE active)          AS products_active,
        (SELECT COUNT(*) FROM categories)                     AS categories,
        (SELECT COUNT(*) FROM categories WHERE active)        AS categories_active,

        -- Soft-deleted customers keep their orders attached, so they
        -- stay in the database. They are not customers any more and do
        -- not belong in a headcount.
        (SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL)
          AS customers,

        (SELECT COUNT(*)
         FROM customers
         WHERE deleted_at IS NULL
           AND created_at >= (SELECT month_start FROM bounds))
          AS customers_this_month
    `;

    try {
      const result = await query(text, [REPORT_UTC_OFFSET]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "catalogueTotals");
    }
  },

  // ==========================================================
  // SALES OVER TIME
  // ==========================================================

  /**
   * Turns "last 30 days" or "1st to 30th of August" into two absolute
   * instants.
   *
   * In SQL rather than in JavaScript, and that is the whole reason this
   * method exists. `2026-08-01` means midnight in Coimbatore, and
   * `new Date("2026-08-01")` in Node means midnight UTC — five and a
   * half hours earlier, which quietly pulls the previous evening's
   * orders into the range. The conversion happens in SQL, next to the
   * bucketing it has to agree with (see REPORT_UTC_OFFSET).
   *
   * The end is exclusive and lands at midnight *after* the `to` date,
   * so a range ending on the 30th includes everything ordered on the
   * 30th. A half-open range is also what makes consecutive ranges join
   * up without double-counting the boundary.
   *
   * @param {string|null} from   ISO date (YYYY-MM-DD), or null for "the
   *                             last `span` periods"
   * @param {string|null} to     ISO date, or null for "up to now"
   */
  async resolveRange({ from = null, to = null, period, span }) {
    const text = `
      WITH local AS (
        SELECT ${truncLocal(toLocal("NOW(6)"), "$4")} AS today_bucket
      ),
      bounds AS (
        SELECT
          COALESCE(
            DATE($2),
            ${addPeriods("today_bucket", "1 - $5", "$4")}
          ) AS from_local,

          COALESCE(
            DATE($3) + INTERVAL 1 DAY,
            ${addPeriods("today_bucket", "1", "$4")}
          ) AS to_local
        FROM local
      )
      SELECT
        ${toInstant("from_local")} AS from_ts,
        ${toInstant("to_local")}   AS to_ts
      FROM bounds
    `;

    try {
      const result = await query(text, [
        REPORT_UTC_OFFSET,
        from,
        to,
        period,
        Number(span),
      ]);

      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "resolveRange", { from, to, period });
    }
  },

  /**
   * Orders and revenue bucketed by day, week or month (F-11.02).
   *
   * Two things make this longer than the GROUP BY it looks like.
   *
   * The buckets are generated, then left-joined onto the orders. A
   * plain GROUP BY returns no row for a day with no orders, and a chart
   * drawn from that closes the gap — three quiet days in a row become a
   * flat line between two spikes instead of the hole they actually are.
   *
   * `period` is bound as a parameter, not interpolated, in both the
   * truncation and the interval that steps the series. The service has
   * already checked it against the policy's whitelist; binding it means
   * a mistake there is still not a way to write SQL.
   *
   * The buckets come from a recursive CTE (MariaDB has no
   * generate_series); MAX_BUCKETS keeps it short.
   */
  async salesSeries({ period, from, to }) {
    const text = `
      WITH RECURSIVE span AS (
        SELECT
          ${truncLocal(toLocal("$3"), "$2")} AS first_bucket,

          -- The range's end is exclusive, so the last bucket is the one
          -- containing the final instant *inside* it. Truncating the
          -- end itself would add an empty bar for the day the range
          -- stops at.
          ${truncLocal(toLocal("($4 - INTERVAL 1 MICROSECOND)"), "$2")} AS last_bucket
      ),
      buckets AS (
        SELECT first_bucket AS bucket_local
        FROM span
        WHERE first_bucket <= last_bucket
        UNION ALL
        SELECT ${addPeriods("b.bucket_local", "1", "$2")}
        FROM buckets b
        CROSS JOIN span s
        WHERE ${addPeriods("b.bucket_local", "1", "$2")} <= s.last_bucket
      ),
      placed AS (
        SELECT
          ${truncLocal(toLocal("o.placed_at"), "$2")} AS bucket_local,

          COUNT(*) AS orders,

          COUNT(CASE WHEN ${cancelledFilterSql("o")} THEN 1 END)
            AS cancelled,

          COUNT(CASE WHEN ${revenueFilterSql("o")} THEN 1 END)
            AS paid_orders,

          COALESCE(
            SUM(CASE WHEN ${revenueFilterSql("o")} THEN ${revenueAmountSql("o")} END),
            0
          ) AS revenue

        FROM orders o
        WHERE o.placed_at >= $3
          AND o.placed_at <  $4
          AND ${isPlacedSql("o")}
        GROUP BY 1
      )
      SELECT
        ${toInstant("b.bucket_local")}               AS bucket_start,
        COALESCE(p.orders, 0)                         AS orders,
        COALESCE(p.cancelled, 0)                      AS cancelled,
        COALESCE(p.paid_orders, 0)                    AS paid_orders,
        CAST(COALESCE(p.revenue, 0) AS DECIMAL(12,2)) AS revenue
      FROM buckets b
      LEFT JOIN placed p ON p.bucket_local = b.bucket_local
      ORDER BY b.bucket_local ASC
    `;

    try {
      const result = await query(text, [REPORT_UTC_OFFSET, period, from, to]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "salesSeries", { period, from, to });
    }
  },

  /**
   * Totals for a range, matching the series above (F-11.02).
   *
   * Summed in SQL rather than by adding up the buckets in JavaScript,
   * because the two are not the same sum: `units` needs order_items, and
   * joining those into the bucket query would multiply an order's header
   * by its number of lines and inflate every count in it.
   */
  async salesTotals({ from, to }) {
    const text = `
      SELECT
        COUNT(*) AS orders,

        COUNT(CASE WHEN ${cancelledFilterSql("o")} THEN 1 END)
          AS cancelled,

        COUNT(CASE WHEN ${revenueFilterSql("o")} THEN 1 END)
          AS paid_orders,

        CAST(COALESCE(SUM(CASE WHEN ${revenueFilterSql("o")} THEN ${revenueAmountSql("o")} END), 0) AS DECIMAL(12,2))
          AS revenue,

        -- Pieces, not lines: two of one size is two pieces. Read from a
        -- subquery so the header count above is not multiplied by it.
        CAST(COALESCE((
          SELECT SUM(i.quantity)
          FROM order_items i
          JOIN orders io ON io.id = i.order_id
          WHERE io.placed_at >= $1
            AND io.placed_at <  $2
            AND ${isPlacedSql("io")}
            AND ${soldFilterSql("io")}
        ), 0) AS SIGNED) AS units

      FROM orders o
      WHERE o.placed_at >= $1
        AND o.placed_at <  $2
        AND ${isPlacedSql("o")}
    `;

    try {
      const result = await query(text, [from, to]);
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "salesTotals", { from, to });
    }
  },

  /**
   * Best-sellers for a range (F-11.04).
   *
   * Grouped by the *snapshot* name on the order line, not by a join to
   * products. An order line records what was sold under the name it was
   * sold under; joining to the live product would drop every line whose
   * product has since been deleted, which is exactly the history a
   * report exists to keep. `product_id` comes along where it survives,
   * so a row can still link to the product page when there is one.
   *
   * Cancelled orders are excluded — those pieces went back on the shelf,
   * and counting them would put something nobody kept at the top.
   */
  async topProducts({ from, to, sort, limit }) {
    const text = `
      SELECT
        MIN(CAST(i.product_id AS CHAR(36))) AS product_id,
        MIN(i.product_name)                 AS product_name,
        MIN(i.product_slug)                 AS product_slug,
        MIN(i.image_url)                    AS image_url,
        COUNT(DISTINCT i.order_id)          AS orders,
        CAST(SUM(i.quantity) AS SIGNED)     AS units,
        CAST(SUM(i.line_total) AS DECIMAL(12,2)) AS revenue
      FROM order_items i
      JOIN orders o ON o.id = i.order_id
      WHERE o.placed_at >= $1
        AND o.placed_at <  $2
        AND ${isPlacedSql("o")}
        AND ${soldFilterSql("o")}

      -- Grouped by product id where the product still exists, and by
      -- the snapshot name where it does not. Grouping by name alone
      -- would merge two different products that happen to share one;
      -- grouping by id alone would drop every line whose product has
      -- been deleted, which is the history this report exists to keep.
      -- (The id is cast to text: COALESCE with a UUID would try to read
      -- 'deleted:…' as a UUID.)
      GROUP BY COALESCE(CAST(i.product_id AS CHAR(36)), 'deleted:' || i.product_name)

      ORDER BY ${topProductsSortSql(sort)}
      LIMIT $3
    `;

    try {
      const result = await query(text, [from, to, Number(limit)]);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "topProducts", { from, to, sort });
    }
  },

  // ==========================================================
  // CATALOGUE BREAKDOWN
  // ==========================================================

  /**
   * One row per category: how much of the catalogue sits in it and how
   * much of that is sellable (F-11.04).
   *
   * A LEFT JOIN from categories, so a category with nothing in it still
   * appears — an empty category is a thing the admin wants to see, and
   * an inner join would hide precisely those.
   *
   * `units` counts stock on active sizes only. A deactivated size holds
   * stock the shop owns but has taken off sale, and adding it here would
   * report inventory the storefront cannot sell.
   */
  async categoryBreakdown() {
    const text = `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.active,
        COUNT(DISTINCT p.id) AS products,
        COUNT(DISTINCT CASE WHEN p.active THEN p.id END) AS products_active,
        CAST(COALESCE(SUM(CASE WHEN v.active THEN v.stock_quantity END), 0) AS SIGNED) AS units,
        COUNT(DISTINCT CASE
          WHEN p.active AND v.active AND v.stock_quantity > 0 THEN p.id
        END) AS products_in_stock
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      LEFT JOIN product_variants v ON v.product_id = p.id
      GROUP BY c.id, c.name, c.slug, c.active
      ORDER BY c.name ASC
    `;

    try {
      const result = await query(text);
      return result.rows;
    } catch (error) {
      throw handleDatabaseError(error, "categoryBreakdown");
    }
  },
};
