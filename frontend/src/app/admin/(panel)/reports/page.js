"use client";

import {
  ChevronLeft,
  ChevronRight,
  IndianRupee,
  Layers,
  Package,
  RefreshCw,
  SearchX,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatTile } from "@/components/admin/ProductBits";
import { ProductCover } from "@/components/admin/ProductThumb";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Select,
  SkeletonRows,
} from "@/components/admin/ui";
import { PAYMENT_FILTERS, paymentMeta, STATUS_FILTERS, statusMeta } from "@/lib/api/orders";
import {
  bucketLabel,
  EMPTY_SALES_TOTALS,
  getInventoryReport,
  getOrderReport,
  getSalesReport,
  REPORT_PERIODS,
  TOP_PRODUCT_SORTS,
} from "@/lib/api/reports";
import { money, number, shortDate } from "@/lib/format";
import { STOCK_LABEL, STOCK_TONE } from "@/lib/stock";

/**
 * Reports (F-11.02 – F-11.05).
 *
 * Three questions the shop asks about itself, kept as three tabs rather
 * than three screens because they share one thing — the range — and
 * splitting them would mean setting the same dates three times.
 *
 * "Basic reports only, within agreed scope" is the FRS's own wording,
 * and it is taken literally here. There is no report builder, no export,
 * no comparison against last year: what exists is sales over time,
 * orders in a range, and what the catalogue is holding.
 *
 * Every figure arrives from the API already decided. Nothing on this
 * page recomputes a total from the rows it was given — a chart that
 * disagrees with the tile above it is the classic way a dashboard loses
 * its credibility, and the only reliable defence is not to do the sum
 * twice.
 */

const TABS = [
  { id: "sales", label: "Sales", requirement: "F-11.02" },
  { id: "orders", label: "Orders", requirement: "F-11.03" },
  { id: "inventory", label: "Inventory", requirement: "F-11.04" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState("sales");

  // The range is shared by the sales and order tabs. Empty means "let
  // the API decide" — the last 30 days, 12 weeks or 12 months
  // depending on the period — which is a better default than a date
  // this page would have to compute in the browser's timezone.
  const [range, setRange] = useState({ from: "", to: "" });
  const [period, setPeriod] = useState("day");
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const clearRange = () => setRange({ from: "", to: "" });
  const ranged = Boolean(range.from || range.to);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Reports
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Sales over time, the orders behind them, and what the catalogue is
            holding. Leave the dates empty for the most recent period.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={refresh}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* ------------------------------------------------------------
          RANGE
          Above the tabs, not inside one, because it applies to two of
          them — moving it into each would mean setting the same dates
          twice and letting them disagree.
      ------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <Field label="From" className="w-40">
            <Input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) =>
                setRange((r) => ({ ...r, from: e.target.value }))
              }
            />
          </Field>

          <Field label="To" className="w-40">
            <Input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </Field>

          {tab === "sales" ? (
            <Field label="Group by" className="w-40">
              <Select
                value={period}
                aria-label="Group sales by"
                onChange={(e) => setPeriod(e.target.value)}
              >
                {REPORT_PERIODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {ranged ? (
            <Button size="sm" variant="ghost" onClick={clearRange}>
              Clear dates
            </Button>
          ) : (
            <p className="pb-2 text-xs text-ink-500">
              Showing the most recent period.
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cx(
              "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              tab === entry.id
                ? "bg-brand-600 text-white"
                : "bg-white text-ink-700 ring-1 ring-inset ring-ink-300 hover:bg-ink-50",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "sales" ? (
        <SalesReport range={range} period={period} reload={reload} onRetry={refresh} />
      ) : tab === "orders" ? (
        <OrderReport range={range} reload={reload} onRetry={refresh} />
      ) : (
        <InventoryReport reload={reload} onRetry={refresh} />
      )}
    </div>
  );
}

// ============================================================
// SALES (F-11.02, F-11.05)
// ============================================================

function SalesReport({ range, period, reload, onRetry }) {
  const [topSort, setTopSort] = useState("units");
  const [metric, setMetric] = useState("revenue");

  // What the stored result was fetched for. Comparing it against the
  // current one says a refetch is in flight without a second flag —
  // the same trick the order queue uses, and the reason the effect
  // below never sets state synchronously.
  const key = `${range.from}|${range.to}|${period}|${topSort}`;

  const [state, setState] = useState({
    status: "loading",
    key: null,
    series: [],
    topProducts: [],
    totals: EMPTY_SALES_TOTALS,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getSalesReport(
      { ...range, period, topSort },
      { signal: controller.signal },
    )
      .then((data) => {
        if (active) setState({ status: "ready", key, ...data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          // The key is stamped on the failure too, or `loading` below
          // would stay true forever and hide the error behind a
          // skeleton that never resolves.
          setState((current) => ({ ...current, status: "error", key, error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, period, topSort, reload, key]);

  const { series, topProducts, totals, error } = state;
  const loading = state.status === "loading" || state.key !== key;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Revenue"
          value={loading ? "—" : money(totals.revenue)}
          sub="payments received"
          tone="green"
        />
        <StatTile
          label="Orders"
          value={loading ? "—" : number(totals.orders)}
          sub={
            totals.cancelled
              ? `${number(totals.cancelled)} cancelled`
              : "none cancelled"
          }
        />
        <StatTile
          label="Paid orders"
          value={loading ? "—" : number(totals.paidOrders)}
          sub="money actually in"
        />
        <StatTile
          label="Pieces sold"
          value={loading ? "—" : number(totals.units)}
          sub="cancelled orders excluded"
        />
        <StatTile
          label="Average order"
          value={loading ? "—" : money(totals.averageOrderValue)}
          sub="across paid orders"
        />
      </div>

      <Card>
        <CardHeader
          title="Orders and revenue over time"
          requirement="F-11.02"
          description={
            state.range
              ? `${shortDate(state.range.from)} — ${shortDate(
                  // The API's range end is exclusive. Printing it as-is
                  // would label a report of August as ending on the 1st
                  // of September.
                  new Date(new Date(state.range.to).getTime() - 1),
                )}`
              : "Buckets with no orders are shown as zero, not skipped."
          }
          actions={
            <Select
              value={metric}
              aria-label="Chart metric"
              className="w-40"
              onChange={(e) => setMetric(e.target.value)}
            >
              <option value="revenue">Revenue</option>
              <option value="orders">Orders</option>
            </Select>
          }
        />

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={onRetry} />
          </div>
        ) : loading ? (
          <SkeletonRows rows={4} />
        ) : series.length === 0 ? (
          <EmptyState
            icon={<IndianRupee className="size-6" aria-hidden="true" />}
            title="Nothing in this range"
            description="No orders were placed between those dates."
          />
        ) : (
          <BarChart series={series} period={period} metric={metric} />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Best sellers"
          requirement="F-11.04"
          description="Ranked over the same range. Cancelled orders are excluded — those pieces went back on the shelf."
          actions={
            <Select
              value={topSort}
              aria-label="Rank best sellers by"
              className="w-48"
              onChange={(e) => setTopSort(e.target.value)}
            >
              {TOP_PRODUCT_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          }
        />

        {loading ? (
          <SkeletonRows rows={5} />
        ) : topProducts.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" aria-hidden="true" />}
            title="Nothing sold in this range"
            description="Once orders come in, the pieces that sold most appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5 text-right">Orders</th>
                  <th className="px-3 py-2.5 text-right">Pieces</th>
                  <th className="px-3 py-2.5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {topProducts.map((row) => (
                  <tr
                    key={row.productId ?? row.name}
                    className="align-middle transition-colors hover:bg-ink-50/70"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <ProductCover
                          product={{
                            id: row.productId,
                            name: row.name,
                            primaryImage: row.imageUrl
                              ? { url: row.imageUrl, altText: row.name }
                              : null,
                          }}
                          size={32}
                        />

                        {/* A deleted product still sold, so the row
                            stays — it just no longer links anywhere. */}
                        {row.productId ? (
                          <Link
                            href={`/admin/products/${row.productId}`}
                            className="font-medium text-ink-800 hover:text-brand-700 hover:underline"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <span
                            className="font-medium text-ink-800"
                            title="This product has since been removed from the catalogue"
                          >
                            {row.name}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-right text-ink-600 tabular-nums">
                      {number(row.orders)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular-nums">
                      {number(row.units)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-900 tabular-nums">
                      {money(row.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * The chart.
 *
 * Hand-drawn from divs rather than pulled in from a charting library:
 * this is one bar series with no axes to speak of, and a dependency for
 * it would be several hundred kilobytes to draw a rectangle.
 *
 * The bars are scaled against the tallest value in the range, so a
 * quiet month is not flattened by one exceptional day elsewhere. A
 * bucket with no orders keeps a hairline so the gap reads as "nothing
 * happened" rather than as a missing bar.
 */
function BarChart({ series, period, metric }) {
  const peak = useMemo(
    () => Math.max(...series.map((point) => point[metric] ?? 0), 0),
    [series, metric],
  );

  const format = metric === "revenue" ? money : number;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-baseline justify-between text-xs text-ink-500">
        <span>{metric === "revenue" ? "Revenue received" : "Orders placed"}</span>
        <span className="tabular-nums">peak {format(peak)}</span>
      </div>

      <div
        className="flex items-end gap-1 overflow-x-auto pb-1"
        style={{ height: 180 }}
        role="img"
        aria-label={`${
          metric === "revenue" ? "Revenue" : "Orders"
        } for each ${period}, from ${bucketLabel(
          series[0]?.bucketStart,
          period,
        )} to ${bucketLabel(series[series.length - 1]?.bucketStart, period)}`}
      >
        {series.map((point) => {
          const value = point[metric] ?? 0;

          // A percentage of the tallest bar, with a floor so a real but
          // tiny value is still visible next to a large one.
          const height = peak > 0 ? Math.max((value / peak) * 100, value > 0 ? 3 : 0) : 0;

          return (
            <div
              key={point.bucketStart}
              className="flex min-w-[18px] flex-1 flex-col justify-end"
              title={`${bucketLabel(point.bucketStart, period)} · ${format(
                value,
              )} · ${number(point.orders)} order${
                point.orders === 1 ? "" : "s"
              }`}
            >
              <div
                className={cx(
                  "rounded-t transition-[height]",
                  value > 0 ? "bg-brand-500" : "bg-ink-200",
                )}
                style={{ height: value > 0 ? `${height}%` : 2 }}
              />
            </div>
          );
        })}
      </div>

      {/* Only the ends and the middle are labelled. One label per bar
          is unreadable at thirty buckets and misleading at twelve,
          because the labels would have to be dropped silently. */}
      <div className="flex justify-between text-[11px] text-ink-500">
        <span>{bucketLabel(series[0]?.bucketStart, period)}</span>
        {series.length > 2 ? (
          <span>
            {bucketLabel(
              series[Math.floor(series.length / 2)]?.bucketStart,
              period,
            )}
          </span>
        ) : null}
        <span>
          {bucketLabel(series[series.length - 1]?.bucketStart, period)}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// ORDERS (F-11.03)
// ============================================================

const PAGE_SIZE = 25;

function OrderReport({ range, reload, onRetry }) {
  const [query, setQuery] = useState({
    status: "all",
    paymentStatus: "all",
    page: 1,
  });

  const [state, setState] = useState({
    status: "loading",
    key: null,
    rows: [],
    totals: EMPTY_SALES_TOTALS,
    pagination: null,
    error: null,
  });

  // A new range is a different result set, so the old page offset means
  // nothing against it.
  //
  // Adjusted during render rather than in an effect. The effect version
  // renders once with the stale page, fires a request for it, then
  // renders again — so the wrong page is briefly fetched and shown.
  // This is React's documented way to derive state from a prop change.
  const [seenRange, setSeenRange] = useState(range);

  if (seenRange !== range) {
    setSeenRange(range);
    if (query.page !== 1) setQuery((q) => ({ ...q, page: 1 }));
  }

  const key = `${range.from}|${range.to}|${query.status}|${query.paymentStatus}|${query.page}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getOrderReport(
      { ...range, ...query, limit: PAGE_SIZE },
      { signal: controller.signal },
    )
      .then((data) => {
        if (active) setState({ status: "ready", key, ...data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", key, error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, query, reload, key]);

  const { rows, totals, pagination, error } = state;
  const loading = state.status === "loading" || state.key !== key;
  const filtered = query.status !== "all" || query.paymentStatus !== "all";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Orders in range"
          value={loading ? "—" : number(totals.orders)}
          sub={
            totals.cancelled
              ? `${number(totals.cancelled)} cancelled`
              : "none cancelled"
          }
        />
        <StatTile
          label="Pieces"
          value={loading ? "—" : number(totals.units)}
          sub="across every order"
        />
        <StatTile
          label="Revenue"
          value={loading ? "—" : money(totals.revenue)}
          sub="payments received"
          tone="green"
        />
        <StatTile
          label="Average order"
          value={loading ? "—" : money(totals.averageOrderValue)}
          sub="across paid orders"
        />
      </div>

      <Card>
        <CardHeader
          title="Order summary"
          requirement="F-11.03"
          description={
            filtered
              ? "The tiles above describe the whole range — narrowing the status below does not change them."
              : "Every order placed in this range, with its customer and quantities."
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={query.status}
                aria-label="Filter by status"
                className="w-44"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))
                }
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select
                value={query.paymentStatus}
                aria-label="Filter by payment"
                className="w-40"
                onChange={(e) =>
                  setQuery((q) => ({
                    ...q,
                    paymentStatus: e.target.value,
                    page: 1,
                  }))
                }
              >
                {PAYMENT_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={onRetry} />
          </div>
        ) : loading ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              filtered ? (
                <SearchX className="size-6" aria-hidden="true" />
              ) : (
                <ShoppingBag className="size-6" aria-hidden="true" />
              )
            }
            title="No orders in this range"
            description={
              filtered
                ? "Try clearing the status filters, or widening the dates."
                : "Widen the dates, or wait for the next order."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  <th className="px-3 py-2.5">Order</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5 text-right">Pieces</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((order) => {
                  const status = statusMeta(order.status);
                  const payment = paymentMeta(order.paymentStatus);

                  return (
                    <tr
                      key={order.id}
                      className="align-middle transition-colors hover:bg-ink-50/70"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-[13px] font-medium text-ink-900 hover:text-brand-700 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {shortDate(order.timeline.placedAt)}
                        </p>
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink-800">
                          {order.contact.name || "—"}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {order.customerId ? "account" : "guest"}
                        </p>
                      </td>

                      <td className="px-3 py-2.5">
                        <p className="text-xs text-ink-600">
                          {order.contact.email}
                        </p>
                        <p className="text-xs text-ink-500">
                          {order.contact.phone}
                        </p>
                      </td>

                      <td className="px-3 py-2.5 text-right whitespace-nowrap text-ink-600 tabular-nums">
                        {number(order.unitCount)}
                        <span className="text-ink-400">
                          {" "}
                          / {number(order.itemCount)}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular-nums">
                        {money(order.total)}
                      </td>

                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <Badge tone={payment.tone}>{payment.label}</Badge>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 px-3 py-2.5">
            <p className="text-xs text-ink-500">
              Page {pagination.page} of {pagination.totalPages} ·{" "}
              {number(pagination.total)} orders
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!pagination.hasNextPage}
                onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
              >
                Next
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ============================================================
// INVENTORY (F-11.04)
// ============================================================

function InventoryReport({ reload, onRetry }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    // No synchronous "loading" flag: a refresh keeps the figures on
    // screen and swaps them when the new ones land, rather than
    // blanking a report the admin is reading.
    getInventoryReport({}, { signal: controller.signal })
      .then((data) => {
        if (active) setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setState((current) => ({ ...current, status: "error", error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  const { data, error } = state;
  const loading = state.status === "loading";

  if (error) {
    return <ErrorNotice error={error} onRetry={onRetry} />;
  }

  const stock = data?.stock;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Pieces on hand"
          value={loading ? "—" : number(stock.totalUnits)}
          sub="on sale, across every size"
        />
        <StatTile
          label="Healthy sizes"
          value={loading ? "—" : number(stock.inStock.sizes)}
          sub={`${stock?.thresholds.lowStockBelow ?? 10} or more each`}
          tone="green"
        />
        <StatTile
          label="Low sizes"
          value={loading ? "—" : number(stock.lowStock.sizes)}
          sub={`across ${number(stock?.lowStock.products ?? 0)} products`}
          tone={stock?.lowStock.sizes ? "amber" : "neutral"}
        />
        <StatTile
          label="Sold-out sizes"
          value={loading ? "—" : number(stock.outOfStock.sizes)}
          sub={`across ${number(stock?.outOfStock.products ?? 0)} products`}
          tone={stock?.outOfStock.sizes ? "red" : "neutral"}
        />
        <StatTile
          label="Products with no sizes"
          value={loading ? "—" : number(stock.productsWithoutSizes)}
          sub="cannot be bought at all"
          tone={stock?.productsWithoutSizes ? "red" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader
          title="By category"
          requirement="F-11.04"
          description="Every category, including the empty ones — a category with nothing in it is worth seeing."
        />

        {loading ? (
          <SkeletonRows rows={6} />
        ) : data.categories.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-6" aria-hidden="true" />}
            title="No categories yet"
            description="Add a category before adding products to it."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 text-right">Products</th>
                  <th className="px-3 py-2.5 text-right">On sale</th>
                  <th className="px-3 py-2.5 text-right">Buyable now</th>
                  <th className="px-3 py-2.5 text-right">Pieces held</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.categories.map((row) => (
                  <tr
                    key={row.id}
                    className="align-middle transition-colors hover:bg-ink-50/70"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/admin/category/${row.id}`}
                        className="font-medium text-ink-800 hover:text-brand-700 hover:underline"
                      >
                        {row.name}
                      </Link>
                      {!row.active ? (
                        <Badge tone="slate" className="ml-2">
                          Off sale
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-600 tabular-nums">
                      {number(row.products)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-600 tabular-nums">
                      {number(row.productsActive)}
                    </td>
                    <td
                      className={cx(
                        "px-3 py-2.5 text-right font-medium tabular-nums",
                        row.productsActive > 0 && row.productsInStock === 0
                          ? "text-red-700"
                          : "text-ink-900",
                      )}
                    >
                      {number(row.productsInStock)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-900 tabular-nums">
                      {number(row.units)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <StockListCard
          title="Sold out"
          requirement="F-11.02"
          tone="red"
          list={data?.outOfStock}
          loading={loading}
          empty="Nothing on sale is sold out."
        />
        <StockListCard
          title="Running low"
          requirement="F-11.02"
          tone="amber"
          list={data?.lowStock}
          loading={loading}
          empty="Nothing on sale is running low."
        />
      </div>
    </div>
  );
}

function StockListCard({ title, requirement, tone, list, loading, empty }) {
  const rows = list?.rows ?? [];
  const total = list?.total ?? 0;

  return (
    <Card>
      <CardHeader
        title={title}
        requirement={requirement}
        description={
          // The list is capped, so the full count has to be stated —
          // otherwise twenty-five rows read as "that is all of them".
          rows.length < total
            ? `Showing ${rows.length} of ${number(total)} sizes`
            : `${number(total)} size${total === 1 ? "" : "s"}`
        }
        actions={
          <Link
            href="/admin/inventory"
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Inventory
          </Link>
        }
      />

      {loading ? (
        <SkeletonRows rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Package className="size-6" aria-hidden="true" />}
          title="Nothing to reorder"
          description={empty}
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((line) => (
            <li key={line.id} className="flex items-center gap-2.5 px-4 py-2.5">
              <ProductCover product={line.product} size={32} />

              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/products/${line.productId}/edit`}
                  className="block truncate text-sm font-medium text-ink-800 hover:text-brand-700 hover:underline"
                >
                  {line.product.name}
                </Link>
                <p className="truncate text-xs text-ink-500">
                  Size {line.size}
                  {line.product.categoryName
                    ? ` · ${line.product.categoryName}`
                    : ""}
                </p>
              </div>

              <Badge tone={STOCK_TONE[line.stockStatus]}>
                {line.stockQuantity === 0
                  ? STOCK_LABEL[line.stockStatus]
                  : `${number(line.stockQuantity)} left`}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
