"use client";

import {
  AlertTriangle,
  ArrowRight,
  PackageX,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  SkeletonRows,
} from "@/components/admin/ui";
import { paymentMeta, statusMeta } from "@/lib/api/orders";
import { EMPTY_DASHBOARD, getDashboard } from "@/lib/api/reports";
import { money, number, shortDate } from "@/lib/format";
import { STOCK_LABEL, STOCK_TONE } from "@/lib/stock";

/**
 * The admin landing screen (F-11.01, F-11.02).
 *
 * This route used to redirect to /admin/products, because there was
 * nothing to land on. What replaces it is a glance, not a workspace:
 * every number here is a link to the screen that can do something about
 * it, and nothing on this page writes.
 *
 * The layout follows the order the shop actually asks its questions.
 * How much came in today, this week, this month — then how much is
 * owed, because that is money already promised against stock already
 * held. Then what needs reordering. Then what has just been ordered.
 *
 * One request fills all of it. Five would let the halves of one screen
 * describe two different moments, and a dashboard that contradicts
 * itself is worse than a slow one.
 */
export default function DashboardPage() {
  const [state, setState] = useState({
    status: "loading",
    data: EMPTY_DASHBOARD,
    error: null,
  });

  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getDashboard({ signal: controller.signal })
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

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { data, error } = state;
  const loading = state.status === "loading";
  const { orders, catalogue, stock } = data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            How the shop is doing today, and what needs attention. Days and
            months are counted in {data.timezone.replace("_", " ")} time, so
            these figures match the timestamps on the orders themselves.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={refresh}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error ? <ErrorNotice error={error} onRetry={refresh} /> : null}

      {/* ------------------------------------------------------------
          MONEY (F-11.02)
          Three windows and one balance. The balance is last and looks
          different because it is a different kind of number — what is
          owed, not what came in, and the two must never be read as one
          running total.
      ------------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PeriodCard
          label="Today"
          revenue={orders.today.revenue}
          window={orders.today}
          loading={loading}
        />
        <PeriodCard
          label="This week"
          revenue={orders.week.revenue}
          window={orders.week}
          loading={loading}
        />
        <PeriodCard
          label="This month"
          revenue={orders.month.revenue}
          window={orders.month}
          loading={loading}
        />
        <PeriodCard
          label="Awaiting payment"
          revenue={orders.pipeline.value}
          tone="amber"
          loading={loading}
          footnote={
            orders.pipeline.orders
              ? `${number(orders.pipeline.orders)} order${
                  orders.pipeline.orders === 1 ? "" : "s"
                } placed, stock held, money not in`
              : "Nothing outstanding"
          }
          href="/admin/orders?paymentStatus=pending"
        />
      </div>

      {/* ------------------------------------------------------------
          THE CATALOGUE (F-11.02, F-11.04)
          Stock figures come from the inventory read model, not from a
          second count — the tile and the screen behind it are the same
          query, so clicking through cannot change the number.
      ------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Products live"
          value={loading ? "—" : number(catalogue.productsActive)}
          sub={
            catalogue.productsInactive
              ? `${number(catalogue.productsInactive)} off sale`
              : "all on sale"
          }
        />
        <StatTile
          label="Sizes low"
          value={loading ? "—" : number(stock.lowStock.sizes)}
          sub={`under ${stock.thresholds.lowStockBelow} left`}
          tone={stock.lowStock.sizes ? "amber" : "neutral"}
        />
        <StatTile
          label="Sizes sold out"
          value={loading ? "—" : number(stock.outOfStock.sizes)}
          sub={`across ${number(stock.outOfStock.products)} product${
            stock.outOfStock.products === 1 ? "" : "s"
          }`}
          tone={stock.outOfStock.sizes ? "red" : "neutral"}
        />
        <StatTile
          label="Pieces in stock"
          value={loading ? "—" : number(stock.totalUnits)}
          sub={`over ${number(stock.totalSizes)} sizes`}
        />
        <StatTile
          label="Customers"
          value={loading ? "—" : number(catalogue.customers)}
          sub={
            catalogue.customersThisMonth
              ? `${number(catalogue.customersThisMonth)} joined this month`
              : "none joined this month"
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* --------------------------------------------------------
            RECENT ORDERS (F-11.03)
            A glance at the queue, not the queue itself — ten rows,
            read-only, with the full screen one click away.
        -------------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Latest orders"
            description={`${number(orders.allTime.orders)} placed all time · ${money(
              orders.allTime.revenue,
            )} taken`}
            actions={
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                All orders
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />

          {loading ? (
            <SkeletonRows rows={5} />
          ) : data.recentOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="size-6" aria-hidden="true" />}
              title="No orders yet"
              description="Orders appear here the moment someone checks out on the storefront."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    <th className="px-3 py-2.5">Order</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Pieces</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.recentOrders.map((order) => {
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

                        <td className="px-3 py-2.5 text-ink-600 tabular-nums">
                          {number(order.unitCount)}
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
        </Card>

        {/* --------------------------------------------------------
            NEEDS REORDERING (F-11.02, F-11.04)
            Two lists rather than one merged by quantity. A sold-out
            size is a sale already being turned away; a low one is a
            warning. Sorting them together buries the zeroes.
        -------------------------------------------------------- */}
        <Card>
          <CardHeader
            title="Needs reordering"
            description={`${number(stock.outOfStock.sizes)} sold out · ${number(
              stock.lowStock.sizes,
            )} under ${stock.thresholds.lowStockBelow}`}
            actions={
              <Link
                href="/admin/inventory"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                Inventory
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />

          {loading ? (
            <SkeletonRows rows={5} />
          ) : data.outOfStock.length === 0 && data.lowStock.length === 0 ? (
            <EmptyState
              icon={<PackageX className="size-6" aria-hidden="true" />}
              title="Everything is in stock"
              description="No size on sale is low or sold out."
            />
          ) : (
            <div className="divide-y divide-ink-100">
              <StockGroup
                title="Sold out"
                icon={<PackageX className="size-3.5" aria-hidden="true" />}
                tone="red"
                lines={data.outOfStock}
                total={stock.outOfStock.sizes}
              />
              <StockGroup
                title="Running low"
                icon={<AlertTriangle className="size-3.5" aria-hidden="true" />}
                tone="amber"
                lines={data.lowStock}
                total={stock.lowStock.sizes}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * One window of takings.
 *
 * Bigger than a <StatTile> because it carries two numbers that mean
 * different things — money in, and how many orders it came from — and
 * flattening them into a label would make the second look like a
 * subtitle of the first.
 */
function PeriodCard({
  label,
  revenue,
  window: figures,
  footnote,
  tone = "neutral",
  href,
  loading,
}) {
  const tones = {
    neutral: "text-ink-900",
    amber: "text-amber-700",
  };

  const body = (
    <>
      <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">
        {label}
      </p>

      <p className={cx("mt-1 text-2xl font-semibold tabular-nums", tones[tone])}>
        {loading ? "—" : money(revenue)}
      </p>

      <p className="mt-0.5 text-xs text-ink-500">
        {loading
          ? " "
          : (footnote ??
            // "3 orders, 2 paid" rather than one number: an order placed
            // and an order paid for are not the same event, and a
            // dashboard that shows only the first overstates the day.
            `${number(figures?.orders ?? 0)} order${
              figures?.orders === 1 ? "" : "s"
            }${
              figures?.paidOrders !== figures?.orders
                ? ` · ${number(figures?.paidOrders ?? 0)} paid`
                : ""
            }${
              figures?.cancelled
                ? ` · ${number(figures.cancelled)} cancelled`
                : ""
            }`)}
      </p>
    </>
  );

  const className =
    "block rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200/80 transition-shadow";

  return href ? (
    <Link href={href} className={cx(className, "hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * One block of stock lines.
 *
 * The count in the header is the full total, not `lines.length` — the
 * list is capped at ten and saying "12 sizes" above ten rows is how the
 * admin knows to open the inventory screen rather than assuming they
 * have seen everything.
 */
function StockGroup({ title, icon, tone, lines, total }) {
  if (lines.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
          <Badge tone={tone}>
            {icon}
            {title}
          </Badge>
        </p>
        <p className="text-xs text-ink-500">
          {lines.length < total
            ? `showing ${lines.length} of ${number(total)}`
            : `${number(total)} size${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-2.5">
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
    </div>
  );
}
