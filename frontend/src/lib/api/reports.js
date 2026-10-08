/**
 * Dashboard and reports (F-11).
 *
 * Read-only, admin-only, and thin on purpose: the figures arrive
 * already decided by the API, and nothing here recomputes one. That is
 * the rule that keeps the dashboard honest — "low stock" means what
 * backend/src/config/stock.policy.js says it means, "this month" is cut
 * where Postgres cut it in the shop's timezone, and neither is
 * re-derived from a browser clock that may be in another country.
 *
 * What this module does own is the shape: turning the API's snake-ish
 * envelope into the objects the screens render, and supplying an empty
 * one so a page can lay itself out before the first response lands.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";
import { toInventoryLine } from "./inventory";
import { toOrder } from "./orders";

// ============================================================
// PERIODS
// ============================================================

export const REPORT_PERIODS = [
  { value: "day", label: "By day" },
  { value: "week", label: "By week" },
  { value: "month", label: "By month" },
];

export const TOP_PRODUCT_SORTS = [
  { value: "units", label: "Most pieces sold" },
  { value: "revenue", label: "Most revenue" },
];

/**
 * How each period labels one bucket.
 *
 * A daily bar wants "30 Aug", a monthly one wants "Aug 2026" — the same
 * date formatted three ways, because a chart axis reading "01 Aug" for
 * a month is ambiguous with the day beside it.
 */
const BUCKET_FORMATS = {
  day: { day: "2-digit", month: "short" },
  week: { day: "2-digit", month: "short" },
  month: { month: "short", year: "numeric" },
};

export function bucketLabel(value, period = "day") {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const label = new Intl.DateTimeFormat(
    "en-IN",
    BUCKET_FORMATS[period] ?? BUCKET_FORMATS.day,
  ).format(date);

  // A weekly bar is a range, and labelling it with its first day alone
  // reads as a daily figure that happens to be seven times too big.
  return period === "week" ? `w/c ${label}` : label;
}

// ============================================================
// EMPTY SHAPES
// ============================================================

const EMPTY_WINDOW = { orders: 0, cancelled: 0, paidOrders: 0, revenue: 0 };

export const EMPTY_DASHBOARD = {
  generatedAt: null,
  timezone: "Asia/Kolkata",
  orders: {
    today: EMPTY_WINDOW,
    week: EMPTY_WINDOW,
    month: EMPTY_WINDOW,
    allTime: EMPTY_WINDOW,
    pipeline: { orders: 0, value: 0 },
    boundaries: { dayStart: null, weekStart: null, monthStart: null },
  },
  catalogue: {
    products: 0,
    productsActive: 0,
    productsInactive: 0,
    categories: 0,
    categoriesActive: 0,
    customers: 0,
    customersThisMonth: 0,
  },
  stock: {
    totalUnits: 0,
    totalSizes: 0,
    inStock: { sizes: 0, products: 0, units: 0 },
    lowStock: { sizes: 0, products: 0, units: 0 },
    outOfStock: { sizes: 0, products: 0, units: 0 },
    unavailable: { sizes: 0, products: 0, units: 0 },
    productsWithoutSizes: 0,
    thresholds: { outOfStockAt: 0, lowStockBelow: 10 },
  },
  recentOrders: [],
  lowStock: [],
  outOfStock: [],
};

export const EMPTY_SALES_TOTALS = {
  orders: 0,
  cancelled: 0,
  paidOrders: 0,
  revenue: 0,
  units: 0,
  averageOrderValue: 0,
};

// ============================================================
// DASHBOARD (F-11.01, F-11.02)
// ============================================================

/**
 * Everything on the admin landing screen, in one request.
 *
 * The lists come back through the same mappers the inventory and order
 * screens use — `toInventoryLine` and `toOrder` — so a row on the
 * dashboard is the same object as the row it links to. Reshaping them
 * here would be a second definition of a stock line, free to drift.
 */
export async function getDashboard({ token, signal } = {}) {
  const data = await api.get("/reports/getDashboard", { token, signal });

  if (!data) return EMPTY_DASHBOARD;

  return {
    ...EMPTY_DASHBOARD,
    ...data,
    recentOrders: (data.recentOrders ?? []).map(toOrder),
    lowStock: (data.lowStock ?? []).map(toInventoryLine),
    outOfStock: (data.outOfStock ?? []).map(toInventoryLine),
  };
}

// ============================================================
// SALES OVER TIME (F-11.02, F-11.05)
// ============================================================

function rangeQuery({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params;
}

/**
 * Orders and revenue per bucket, with the best-sellers beside them.
 *
 * Buckets with no orders arrive as zeroes rather than as gaps — the API
 * generates the series and left-joins the orders onto it — so a chart
 * can render the array straight through without filling holes itself.
 *
 * @param {object} query
 * @param {"day"|"week"|"month"} [query.period]
 * @param {string} [query.from]  YYYY-MM-DD; omitted means "the last 30
 *                               days / 12 weeks / 12 months"
 * @param {string} [query.to]    YYYY-MM-DD, inclusive
 */
export async function getSalesReport(query = {}, { token, signal } = {}) {
  const params = rangeQuery(query);

  if (query.period) params.set("period", query.period);
  if (query.topSort) params.set("topSort", query.topSort);
  if (query.topLimit) params.set("topLimit", String(query.topLimit));

  const qs = params.toString();

  const { data, meta } = await api.get(
    `/reports/getSalesReport${qs ? `?${qs}` : ""}`,
    { token, signal, envelope: true },
  );

  return {
    series: data?.series ?? [],
    topProducts: data?.topProducts ?? [],
    totals: meta?.totals ?? EMPTY_SALES_TOTALS,
    period: meta?.period ?? "day",
    topSort: meta?.topSort ?? "units",
    range: meta?.range ?? null,
    timezone: meta?.timezone ?? "Asia/Kolkata",
  };
}

// ============================================================
// ORDER SUMMARY (F-11.03)
// ============================================================

/**
 * Orders in a range, with their customer and their quantities.
 *
 * The rows are `toOrder` objects — the same ones the order queue lists
 * — so a row here can link straight to the order screen and show the
 * same totals when it gets there.
 *
 * `totals` describes the whole range and ignores the status filter,
 * which is deliberate and worth surfacing in the UI: narrowing to
 * "cancelled" does not change what the shop took that month.
 */
export async function getOrderReport(query = {}, { token, signal } = {}) {
  const params = rangeQuery(query);

  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.paymentStatus && query.paymentStatus !== "all") {
    params.set("paymentStatus", query.paymentStatus);
  }
  if (query.search) params.set("search", query.search);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));

  const qs = params.toString();

  const { data, meta } = await api.get(
    `/reports/getOrderReport${qs ? `?${qs}` : ""}`,
    { token, signal, envelope: true },
  );

  return {
    rows: (data ?? []).map(toOrder),
    totals: meta?.totals ?? EMPTY_SALES_TOTALS,
    range: meta?.range ?? null,
    pagination: meta?.pagination ?? {
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

// ============================================================
// PRODUCT & INVENTORY SUMMARY (F-11.04)
// ============================================================

export async function getInventoryReport(
  { categoryId, limit } = {},
  { token, signal } = {},
) {
  const params = new URLSearchParams();

  if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
  if (limit) params.set("limit", String(limit));

  const qs = params.toString();

  const data = await api.get(
    `/reports/getInventoryReport${qs ? `?${qs}` : ""}`,
    { token, signal },
  );

  return {
    stock: data?.stock ?? EMPTY_DASHBOARD.stock,
    categories: data?.categories ?? [],
    lowStock: {
      total: data?.lowStock?.total ?? 0,
      rows: (data?.lowStock?.rows ?? []).map(toInventoryLine),
    },
    outOfStock: {
      total: data?.outOfStock?.total ?? 0,
      rows: (data?.outOfStock?.rows ?? []).map(toInventoryLine),
    },
  };
}
