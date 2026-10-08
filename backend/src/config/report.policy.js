// src/config/report.policy.js
//
// The one definition of what a report counts (F-11).
//
// Mirrors stock.policy.js and order.policy.js: the validator, the
// service and the repository all need to agree about what "today"
// means and which orders are money, and a rule split across three
// files is how a dashboard ends up disagreeing with the order screen
// it links to.
//
// Nothing here has a table. Every figure the dashboard shows is
// derived from orders, order_items, products and product_variants at
// read time — there is no rollup table to fall behind, and a shop this
// size will never have enough rows to need one. If that changes, the
// place to add caching is the service, not a second copy of the
// numbers.

import { ORDER_STATUS, PAYMENT_STATUS } from "./order.policy.js";

// ============================================================
// TIME
// ============================================================

/**
 * The shop's clock.
 *
 * Every bucket boundary is computed in this zone, not in UTC and not in
 * the admin's browser. An order placed at 1am IST is placed on the 3rd
 * as far as the shop is concerned; bucketing it in UTC would file it
 * under the 2nd, and "orders today" would silently disagree with the
 * timestamps printed next to them on the order screen.
 *
 * A constant rather than an environment variable: there is one shop, it
 * is in Coimbatore, and a wrong value here is a wrong report that looks
 * completely plausible.
 */
export const REPORT_TIMEZONE = "Asia/Kolkata";

/**
 * The bucket sizes the sales report offers.
 *
 * These are Postgres `date_trunc` fields, which is why the values are
 * the words they are — the repository passes them straight through as a
 * bound parameter, and this list is what stops anything else reaching
 * it.
 */
export const REPORT_PERIOD = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
};

export const REPORT_PERIODS = Object.values(REPORT_PERIOD);

export const DEFAULT_PERIOD = REPORT_PERIOD.DAY;

/**
 * How far back each period defaults to when the caller names no range.
 *
 * Chosen so the chart is readable rather than complete: thirty daily
 * bars, twelve weekly, twelve monthly. The caller can always ask for a
 * range explicitly.
 */
export const DEFAULT_SPAN = Object.freeze({
  [REPORT_PERIOD.DAY]: 30,
  [REPORT_PERIOD.WEEK]: 12,
  [REPORT_PERIOD.MONTH]: 12,
});

/**
 * The most buckets one series may return.
 *
 * A guard on the response size, not on the data: asking for five years
 * of daily bars is a mistake in the caller, and returning 1,800 rows to
 * draw a chart nobody can read is worse than refusing.
 */
export const MAX_BUCKETS = 400;

// ============================================================
// WHAT COUNTS AS MONEY
// ============================================================
//
// Two different questions, and the dashboard answers both because the
// shop asks both:
//
//   revenue     money that actually arrived. Payment status, not order
//               status — an order can be paid and not yet packed, and
//               that money is in the bank either way.
//
//   pipeline    the value of orders placed but not yet paid for. Not
//               revenue, and never added to it. Stock is already held
//               against these, so they are what the shop stands to take
//               if every pending order goes through.
//
// A cancelled order is excluded from the pipeline for the obvious
// reason, but a cancelled order that *was* paid still counts as revenue
// until it is refunded — the money is in the account, and the refund is
// its own event with its own payment status.

/** Orders whose money has arrived. */
export const revenueFilterSql = (alias = "o") =>
  `${alias}.payment_status = '${PAYMENT_STATUS.PAID}'`;

/** Orders placed, not yet paid, and not abandoned. */
export const pipelineFilterSql = (alias = "o") =>
  `${alias}.payment_status = '${PAYMENT_STATUS.PENDING}' AND ${alias}.status <> '${ORDER_STATUS.CANCELLED}'`;

export const cancelledFilterSql = (alias = "o") =>
  `${alias}.status = '${ORDER_STATUS.CANCELLED}'`;

/**
 * Orders that represent a sale rather than an abandoned attempt.
 *
 * What "top products" is ranked over. A cancelled order's lines are
 * excluded: the pieces went back on the shelf, and counting them would
 * put a product nobody kept at the top of the best-seller list.
 */
export const soldFilterSql = (alias = "o") =>
  `${alias}.status <> '${ORDER_STATUS.CANCELLED}'`;

// ============================================================
// LIST SIZES
// ============================================================

/**
 * How many rows the dashboard's inline lists carry.
 *
 * The dashboard is a glance, not a screen to work from — every list on
 * it links to the full one. Ten is about what fits without scrolling
 * next to the tiles.
 */
export const DASHBOARD_LIST_SIZE = 10;

/** The order report paginates, like the order queue it summarises. */
export const DEFAULT_PAGE_SIZE = 25;

export const MAX_PAGE_SIZE = 100;

/** Best-sellers worth showing. Beyond this it is a catalogue, not a report. */
export const MAX_TOP_PRODUCTS = 50;

export const DEFAULT_TOP_PRODUCTS = 10;

/**
 * How best-sellers are ranked.
 *
 * Both, because they answer different questions: `units` is what to
 * reorder, `revenue` is what pays the rent, and for a shop selling
 * ₹800 kurtas beside ₹6,000 lehengas the two lists are not the same
 * list.
 */
export const TOP_PRODUCTS_SORT = {
  UNITS: "units",
  REVENUE: "revenue",
};

export const TOP_PRODUCTS_SORTS = Object.values(TOP_PRODUCTS_SORT);

export const DEFAULT_TOP_PRODUCTS_SORT = TOP_PRODUCTS_SORT.UNITS;

/**
 * ORDER BY for a best-seller ranking.
 *
 * Both branches end in the product name so two products that sold the
 * same amount have a defined order — without it Postgres may hand back
 * one of them twice across two pages and never the other.
 */
export const topProductsSortSql = (sort) =>
  sort === TOP_PRODUCTS_SORT.REVENUE
    ? "revenue DESC, units DESC, product_name ASC"
    : "units DESC, revenue DESC, product_name ASC";
