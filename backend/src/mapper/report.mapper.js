// src/mapper/report.mapper.js
//
// Reports (F-11) are read-only, so this mapper has one job the others
// do not: making sure a number arrives as a number.
//
// `pg` returns DECIMAL and NUMERIC as strings, deliberately — a rupee
// total does not survive a round trip through a JavaScript float
// intact. Every money column below is therefore cast explicitly at the
// edge, once, rather than left for a client to guess at. String
// concatenation is what "₹" + revenue would silently become otherwise.

import { REPORT_TIMEZONE } from "../config/report.policy.js";

/** NUMERIC arrives as a string; JSON should carry a number. */
const toNumber = (value) => Number(value ?? 0) || 0;

const toInt = (value) => Math.trunc(Number(value ?? 0)) || 0;

/** The four measures one time window carries. */
const windowOf = (row, key) => ({
  orders: toInt(row?.[`${key}_orders`]),
  cancelled: toInt(row?.[`${key}_cancelled`]),
  paidOrders: toInt(row?.[`${key}_paid_orders`]),
  revenue: toNumber(row?.[`${key}_revenue`]),
});

export const ReportMapper = {
  /**
   * Orders and revenue by window (F-11.02).
   *
   * `pipeline` sits outside the windows on purpose: it is a standing
   * balance rather than a period figure — what is owed right now,
   * whenever those orders were placed. Nesting it beside "this month"
   * would invite somebody to add the two.
   */
  toOrderTotals(row) {
    return {
      today: windowOf(row, "today"),
      week: windowOf(row, "week"),
      month: windowOf(row, "month"),
      allTime: windowOf(row, "all_time"),

      pipeline: {
        orders: toInt(row?.pipeline_orders),
        value: toNumber(row?.pipeline_value),
      },

      // Echoed so a client never computes "the start of this week"
      // itself and lands a day out — the shop's week starts where
      // Postgres cut it, in the shop's timezone, not in the browser's.
      boundaries: {
        dayStart: row?.day_start ?? null,
        weekStart: row?.week_start ?? null,
        monthStart: row?.month_start ?? null,
      },
    };
  },

  toCatalogueTotals(row) {
    const products = toInt(row?.products);
    const productsActive = toInt(row?.products_active);

    return {
      products,
      productsActive,

      // Derived rather than counted again: two counts of the same
      // table taken at the same instant that do not add up is a bug
      // nobody would ever look for.
      productsInactive: products - productsActive,

      categories: toInt(row?.categories),
      categoriesActive: toInt(row?.categories_active),

      customers: toInt(row?.customers),
      customersThisMonth: toInt(row?.customers_this_month),
    };
  },

  /** One bar of the sales chart. */
  toSeriesPoint(row) {
    return {
      bucketStart: row.bucket_start,
      orders: toInt(row.orders),
      cancelled: toInt(row.cancelled),
      paidOrders: toInt(row.paid_orders),
      revenue: toNumber(row.revenue),
    };
  },

  toSeries(rows = []) {
    return rows.map((row) => ReportMapper.toSeriesPoint(row));
  },

  toSalesTotals(row) {
    return {
      orders: toInt(row?.orders),
      cancelled: toInt(row?.cancelled),
      paidOrders: toInt(row?.paid_orders),
      revenue: toNumber(row?.revenue),
      units: toInt(row?.units),

      // The figure the shop actually quotes when asked "how are we
      // doing" — computed here so two screens cannot round it
      // differently. Guarded, because a range with no paid orders is a
      // real answer and not a division by zero.
      averageOrderValue: toInt(row?.paid_orders)
        ? Number((toNumber(row?.revenue) / toInt(row.paid_orders)).toFixed(2))
        : 0,
    };
  },

  /**
   * One best-seller line.
   *
   * `productId` is null once the product has been deleted — the line
   * still counts, it just no longer links anywhere. The client is
   * expected to render the name without a link rather than hide the
   * row, because the sale happened.
   */
  toTopProduct(row) {
    return {
      productId: row.product_id ?? null,
      name: row.product_name ?? "",
      slug: row.product_slug ?? null,
      imageUrl: row.image_url ?? null,
      orders: toInt(row.orders),
      units: toInt(row.units),
      revenue: toNumber(row.revenue),
    };
  },

  toTopProducts(rows = []) {
    return rows.map((row) => ReportMapper.toTopProduct(row));
  },

  toCategoryLine(row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      products: toInt(row.products),
      productsActive: toInt(row.products_active),
      productsInStock: toInt(row.products_in_stock),
      units: toInt(row.units),
    };
  },

  toCategoryBreakdown(rows = []) {
    return rows.map((row) => ReportMapper.toCategoryLine(row));
  },

  /**
   * The whole dashboard, assembled from parts that other features own.
   *
   * `stock` and the two lists come through their own feature's mapper
   * — the service passes them in already shaped. That is the point: the
   * dashboard's low-stock line is byte-for-byte the inventory screen's
   * low-stock line, so a click through from one to the other cannot
   * show a different number.
   */
  toDashboard({
    orderTotals,
    catalogueTotals,
    stock,
    recentOrders = [],
    lowStock = [],
    outOfStock = [],
  }) {
    return {
      generatedAt: new Date().toISOString(),

      // The zone every boundary above was cut in. Without it a client
      // has no way to label "today" honestly.
      timezone: REPORT_TIMEZONE,

      orders: ReportMapper.toOrderTotals(orderTotals),
      catalogue: ReportMapper.toCatalogueTotals(catalogueTotals),
      stock,
      recentOrders,

      // Two lists, not one merged "needs attention": they are different
      // jobs. A sold-out size is a sale already being turned away and
      // wants reordering today; a low one is a warning. Merging them
      // sorted by quantity would bury the zeroes under the ones.
      lowStock,
      outOfStock,
    };
  },
};
