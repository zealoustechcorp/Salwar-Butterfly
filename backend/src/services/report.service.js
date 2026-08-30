// src/services/report.service.js
//
// Dashboard and reports (F-11).
//
// Mostly composition rather than logic. Three of the four screens this
// serves are other features' data looked at from a distance, so the
// work here is deciding *which* existing query answers the question and
// letting it answer — the inventory read model for stock, the order
// read model for orders — instead of writing a second query that agrees
// with it only until one of them is edited.
//
// The one thing this layer genuinely owns is the range: what "this
// month" means, how far back a chart goes by default, and how many
// buckets is too many.

import { InventoryRepository } from "../repository/inventory.repository.js";
import { OrderRepository } from "../repository/order.repository.js";
import { ReportRepository } from "../repository/report.repository.js";

import { InventoryMapper } from "../mapper/inventory.mapper.js";
import { OrderMapper } from "../mapper/order.mapper.js";
import { ReportMapper } from "../mapper/report.mapper.js";

import { STOCK_STATUS } from "../config/stock.policy.js";
import {
  ORDER_SORT,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "../config/order.policy.js";
import {
  DASHBOARD_LIST_SIZE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PERIOD,
  DEFAULT_SPAN,
  DEFAULT_TOP_PRODUCTS,
  DEFAULT_TOP_PRODUCTS_SORT,
  MAX_BUCKETS,
  MAX_PAGE_SIZE,
  MAX_TOP_PRODUCTS,
  REPORT_PERIODS,
  REPORT_TIMEZONE,
  TOP_PRODUCTS_SORTS,
} from "../config/report.policy.js";

import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD, which is the only date shape a report range accepts. */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return normalized;
};

/**
 * A calendar date, or null.
 *
 * Deliberately not `new Date(value)`. A date typed into a report filter
 * is a day in the shop's calendar, not an instant, and parsing it in
 * Node would resolve it against the server's timezone — which is UTC in
 * every deployment this will see. The string is handed to Postgres
 * as-is and turned into an instant there, where the shop's zone is
 * actually known.
 *
 * The regex is what stops that from being a way to pass Postgres
 * something other than a date; the `::date` cast on the other side
 * would reject it too, but as a 500 rather than a sentence.
 */
const normalizeDate = (value, label) => {
  if (value === undefined || value === null || value === "") return null;

  const text = String(value).trim();

  if (!ISO_DATE_REGEX.test(text)) {
    throw new ApiError(400, `${label} must be a date in YYYY-MM-DD form`);
  }

  // Rejects 2026-02-31, which matches the shape but is not a day.
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(text)) {
    throw new ApiError(400, `${label} is not a real date`);
  }

  return text;
};

const normalizeSearch = (value) => {
  const search = String(value ?? "").trim();
  return search ? search.slice(0, 255) : null;
};

/**
 * The shortest a bucket of `period` can be, in milliseconds.
 *
 * Used only to refuse an absurd range before running the query that
 * would materialise it. A month is counted as 28 days so the guard
 * errs towards over-estimating the bucket count — refusing a range
 * that would have just fit is a better failure than building 1,800
 * bars nobody can read.
 */
const SHORTEST_BUCKET_MS = {
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 28 * 86_400_000,
};

/**
 * Resolves a range and checks it is worth drawing.
 *
 * The order matters: the range is resolved in Postgres first — it is
 * the only thing that knows where the shop's day starts — and only then
 * measured here.
 */
const resolveRange = async ({ from, to, period }) => {
  const range = await ReportRepository.resolveRange({
    from,
    to,
    period,
    span: DEFAULT_SPAN[period],
  });

  if (!range?.from_ts || !range?.to_ts) {
    throw new ApiError(500, "Failed to resolve the report range");
  }

  const fromMs = new Date(range.from_ts).getTime();
  const toMs = new Date(range.to_ts).getTime();

  if (toMs <= fromMs) {
    throw new ApiError(400, "The end of the range must fall after its start");
  }

  const buckets = Math.ceil((toMs - fromMs) / SHORTEST_BUCKET_MS[period]);

  if (buckets > MAX_BUCKETS) {
    throw new ApiError(
      400,
      `That range is ${buckets} ${period}s long — more than the ${MAX_BUCKETS} a single report will return. Narrow the dates, or group by a longer period.`,
    );
  }

  return { from: range.from_ts, to: range.to_ts };
};

export const ReportService = {
  // ==========================================================
  // F-11.01 / F-11.02 — THE DASHBOARD
  // ==========================================================

  /**
   * Everything the admin landing screen shows, in one request.
   *
   * One request rather than five, because the screen is a single
   * statement about the shop and five requests would let its halves
   * describe two different moments. The cost of that is a fatter
   * payload on one screen, which is the right trade for a page opened
   * once and read.
   *
   * Note what is *not* computed here: `stock` comes from the inventory
   * read model and the two lists below it come from the same query the
   * inventory screen runs. Clicking from a dashboard tile to the screen
   * behind it must not change the number.
   */
  async getDashboard() {
    try {
      const [orderTotals, catalogueTotals, stockSummary, recent, low, out] =
        await Promise.all([
          ReportRepository.orderTotals(),
          ReportRepository.catalogueTotals(),
          InventoryRepository.summary(),

          OrderRepository.findAll({
            sort: ORDER_SORT.RECENT,
            page: 1,
            limit: DASHBOARD_LIST_SIZE,
          }),

          // activeOnly: a deactivated product running low is not
          // something to act on today — it is not on sale.
          InventoryRepository.findAll({
            status: STOCK_STATUS.LOW_STOCK,
            activeOnly: true,
            sort: "stock_asc",
            page: 1,
            limit: DASHBOARD_LIST_SIZE,
          }),

          InventoryRepository.findAll({
            status: STOCK_STATUS.OUT_OF_STOCK,
            activeOnly: true,
            sort: "product",
            page: 1,
            limit: DASHBOARD_LIST_SIZE,
          }),
        ]);

      logger.info("Dashboard fetched", {
        orders: orderTotals?.all_time_orders,
        lowStock: low.rows.length,
        outOfStock: out.rows.length,
      });

      return ReportMapper.toDashboard({
        orderTotals,
        catalogueTotals,
        stock: InventoryMapper.toSummary(stockSummary),
        recentOrders: OrderMapper.toDTOList(recent.rows),
        lowStock: InventoryMapper.toDTOList(low.rows),
        outOfStock: InventoryMapper.toDTOList(out.rows),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReportService.getDashboard failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to build the dashboard");
    }
  },

  // ==========================================================
  // F-11.02 / F-11.05 — SALES OVER TIME
  // ==========================================================

  /**
   * Orders and revenue per day, week or month, with the best-sellers
   * for the same range.
   *
   * The series and the totals are two queries over one range rather
   * than one query the caller adds up, because they are not the same
   * arithmetic: `units` needs the order lines, and joining those into
   * the bucketed query would multiply each order header by its number
   * of lines.
   */
  async getSalesReport({
    period = DEFAULT_PERIOD,
    from = null,
    to = null,
    topSort = DEFAULT_TOP_PRODUCTS_SORT,
    topLimit = DEFAULT_TOP_PRODUCTS,
  } = {}) {
    try {
      if (!REPORT_PERIODS.includes(period)) {
        throw new ApiError(
          400,
          `Unknown period "${period}". Expected one of: ${REPORT_PERIODS.join(", ")}.`,
        );
      }

      if (!TOP_PRODUCTS_SORTS.includes(topSort)) {
        throw new ApiError(
          400,
          `Unknown ranking "${topSort}". Expected one of: ${TOP_PRODUCTS_SORTS.join(", ")}.`,
        );
      }

      const safeTopLimit = Math.min(
        Math.max(Number(topLimit) || DEFAULT_TOP_PRODUCTS, 1),
        MAX_TOP_PRODUCTS,
      );

      const range = await resolveRange({
        from: normalizeDate(from, "The start of the range"),
        to: normalizeDate(to, "The end of the range"),
        period,
      });

      const [series, totals, top] = await Promise.all([
        ReportRepository.salesSeries({ period, ...range }),
        ReportRepository.salesTotals(range),
        ReportRepository.topProducts({
          ...range,
          sort: topSort,
          limit: safeTopLimit,
        }),
      ]);

      logger.info("Sales report fetched", {
        period,
        buckets: series.length,
        from: range.from,
        to: range.to,
      });

      return {
        period,
        timezone: REPORT_TIMEZONE,

        // The instants the figures actually cover, echoed back. The end
        // is exclusive — a client labelling the range should print the
        // day before it, not the boundary itself.
        range,

        series: ReportMapper.toSeries(series),
        totals: ReportMapper.toSalesTotals(totals),
        topProducts: ReportMapper.toTopProducts(top),
        topSort,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReportService.getSalesReport failed", {
        period,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to build the sales report");
    }
  },

  // ==========================================================
  // F-11.03 — ORDER SUMMARY
  // ==========================================================

  /**
   * Orders in a range, with their customer and their quantities.
   *
   * `OrderRepository.findAll` already answers this — it filters by
   * date, joins the customer and carries the lines — so this adds the
   * range and the totals and nothing else. A second query shaped like
   * the order queue's would be a second thing to keep in step with it.
   */
  async getOrderReport({
    from = null,
    to = null,
    status = null,
    paymentStatus = null,
    search = null,
    sort = ORDER_SORT.RECENT,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  } = {}) {
    try {
      if (status && !ORDER_STATUSES.includes(status)) {
        throw new ApiError(
          400,
          `Unknown status "${status}". Expected one of: ${ORDER_STATUSES.join(", ")}.`,
        );
      }

      if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
        throw new ApiError(
          400,
          `Unknown payment status "${paymentStatus}". Expected one of: ${PAYMENT_STATUSES.join(", ")}.`,
        );
      }

      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(
        Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );

      const range = await resolveRange({
        from: normalizeDate(from, "The start of the range"),
        to: normalizeDate(to, "The end of the range"),
        period: DEFAULT_PERIOD,
      });

      const [result, totals] = await Promise.all([
        OrderRepository.findAll({
          status: status || null,
          paymentStatus: paymentStatus || null,
          search: normalizeSearch(search),
          placedFrom: range.from,

          // `findAll` compares with `<=` while the range's end is
          // exclusive. A millisecond back off it keeps the two
          // agreeing, rather than letting an order placed at exactly
          // midnight fall into both this range and the next one.
          placedTo: new Date(new Date(range.to).getTime() - 1).toISOString(),

          sort,
          page: safePage,
          limit: safeLimit,
        }),
        ReportRepository.salesTotals(range),
      ]);

      const totalPages =
        result.total === 0 ? 0 : Math.ceil(result.total / safeLimit);

      logger.info("Order report fetched", {
        returned: result.rows.length,
        total: result.total,
      });

      return {
        timezone: REPORT_TIMEZONE,
        range,

        data: OrderMapper.toDTOList(result.rows),

        // Describes the whole range, not the page — and not the status
        // filter either, which is why it is worth stating: filtering to
        // "cancelled" does not make the revenue figure change.
        totals: ReportMapper.toSalesTotals(totals),

        pagination: {
          page: safePage,
          limit: safeLimit,
          total: result.total,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
        },
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReportService.getOrderReport failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to build the order report");
    }
  },

  // ==========================================================
  // F-11.04 — PRODUCT AND INVENTORY SUMMARY
  // ==========================================================

  /**
   * What the shop is holding, by status and by category.
   *
   * The lists are the same rows the inventory screen shows, capped:
   * this is a summary that says "these are the ones", not a second
   * inventory screen. Anything longer than the cap is a signal to open
   * the real one, which is why the response carries the full counts
   * beside the truncated lists.
   */
  async getInventoryReport({ categoryId = null, limit = 25 } = {}) {
    try {
      const category = categoryId ? assertUuid(categoryId, "category ID") : null;

      const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);

      const [stockSummary, categories, low, out] = await Promise.all([
        InventoryRepository.summary({ categoryId: category }),
        ReportRepository.categoryBreakdown(),

        InventoryRepository.findAll({
          status: STOCK_STATUS.LOW_STOCK,
          categoryId: category,
          activeOnly: true,
          sort: "stock_asc",
          page: 1,
          limit: safeLimit,
        }),

        InventoryRepository.findAll({
          status: STOCK_STATUS.OUT_OF_STOCK,
          categoryId: category,
          activeOnly: true,
          sort: "product",
          page: 1,
          limit: safeLimit,
        }),
      ]);

      logger.info("Inventory report fetched", {
        categoryId: category,
        categories: categories.length,
      });

      return {
        stock: InventoryMapper.toSummary(stockSummary),
        categories: ReportMapper.toCategoryBreakdown(categories),

        lowStock: {
          total: low.total,
          rows: InventoryMapper.toDTOList(low.rows),
        },

        outOfStock: {
          total: out.total,
          rows: InventoryMapper.toDTOList(out.rows),
        },
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("ReportService.getInventoryReport failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to build the inventory report");
    }
  },
};
