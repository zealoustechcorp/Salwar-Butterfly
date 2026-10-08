"use client";

import {
  ChevronLeft,
  ChevronRight,
  Package,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatGrid, StatTile } from "@/components/admin/ProductBits";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Input,
  Select,
  SkeletonRows,
} from "@/components/admin/ui";
import {
  EMPTY_SUMMARY,
  getOrderSummary,
  listOrders,
  ORDER_SORTS,
  PAYMENT_FILTERS,
  paymentMeta,
  STATUS_FILTERS,
  statusMeta,
} from "@/lib/api/orders";
import { money, number, shortDate } from "@/lib/format";

/**
 * The order queue (F-09.04) — everything the shop has been asked to send.
 *
 * A worklist before it is a report, which is what decides the layout.
 * The tiles across the top are the four things that need somebody to do
 * something today, in the sequence the work actually happens: money to
 * check, parcels to pack, parcels to hand over, parcels in transit. The
 * revenue figure sits last because nobody acts on it.
 *
 * The tiles count every order in the shop, not the twenty-five below
 * them, and come from their own request for exactly that reason —
 * filtering the table must not change what "3 to pack" means.
 *
 * Read-only, like the customer list. Confirming a payment needs a
 * reference, cancelling needs a reason, and neither is a thing to do by
 * mistake from a row in a table — every write lives on the order's own
 * screen, one click away.
 */

const DEFAULT_QUERY = {
  search: "",
  status: "all",
  paymentStatus: "all",
  sort: "recent",
  page: 1,
};

const PAGE_SIZE = 25;

export default function OrdersPage() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [reload, setReload] = useState(0);

  // Request and outcome in one object: comparing the stored query with
  // the current one says a refetch is in flight without a second flag.
  const [result, setResult] = useState({
    status: "loading",
    query: null,
    rows: [],
    pagination: null,
    error: null,
  });

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  // Debounced, so a search does not fire a request per keystroke. A new
  // term also rewinds to page 1 — the old offset means nothing against
  // a different result set.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setQuery((q) =>
          q.search === searchInput ? q : { ...q, search: searchInput, page: 1 },
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listOrders({ ...query, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setResult({ status: "ready", query, ...data, error: null });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setResult((current) => ({
            ...current,
            status: "error",
            query,
            error,
          }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, reload]);

  // Deliberately not keyed on `query`. The tiles describe the whole
  // queue, so a filter below them is not a reason to refetch them.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getOrderSummary({ signal: controller.signal })
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        // A failed summary is not worth an error screen over a queue
        // that loaded. The tiles stay at their last figures and the
        // table below says whether the API is reachable at all.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { rows, pagination, error } = result;
  const loading = result.status === "loading" || result.query !== query;

  const filtered =
    query.search !== "" ||
    query.status !== "all" ||
    query.paymentStatus !== "all";

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Orders
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Every order placed on the storefront, newest first. Open one to
            confirm its payment, move it along, or cancel it.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={refresh}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <StatGrid cols={5}>
        <StatTile
          label="Awaiting payment"
          value={number(summary.awaitingPayment)}
          sub="stock held, money not in"
          tone={summary.awaitingPayment ? "amber" : "neutral"}
        />
        <StatTile
          label="To pack"
          value={number(summary.toPack)}
          sub="paid and waiting to be picked"
          tone={summary.toPack ? "brand" : "neutral"}
        />
        <StatTile
          label="To ship"
          value={number(summary.toShip)}
          sub="boxed, waiting for the courier"
          tone={summary.toShip ? "brand" : "neutral"}
        />
        <StatTile
          label="In transit"
          value={number(summary.inTransit)}
          sub="with the courier"
        />
        <StatTile
          label="Revenue taken"
          value={money(summary.paidRevenue)}
          sub={`${number(summary.totalOrders)} order${
            summary.totalOrders === 1 ? "" : "s"
          } all time`}
          tone="green"
        />
      </StatGrid>

      <Card>
        <CardHeader
          title="All orders"
          description={
            pagination && !loading
              ? `${number(pagination.total)} ${
                  pagination.total === 1 ? "order" : "orders"
                }${filtered ? " matching these filters" : ""}`
              : "Search by order number, name, email or phone."
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400"
                />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="SB-001042, name, email or phone"
                  aria-label="Search orders"
                  className="w-64 pl-8"
                />
              </div>

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

              <Select
                value={query.sort}
                aria-label="Sort orders"
                className="w-44"
                onChange={(e) =>
                  setQuery((q) => ({ ...q, sort: e.target.value, page: 1 }))
                }
              >
                {ORDER_SORTS.map((sort) => (
                  <option key={sort.value} value={sort.value}>
                    {sort.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={refresh} />
          </div>
        ) : loading ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={
              filtered ? (
                <SearchX className="size-6" aria-hidden="true" />
              ) : (
                <Package className="size-6" aria-hidden="true" />
              )
            }
            title={filtered ? "No orders match those filters" : "No orders yet"}
            description={
              filtered
                ? "Try the order number on its own, part of a name, or clear the status filter."
                : "Orders appear here the moment someone checks out on the storefront."
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearchInput("");
                    setQuery(DEFAULT_QUERY);
                  }}
                >
                  Clear filters
                </Button>
              ) : null
            }
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
                  <th className="px-3 py-2.5">Payment</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="w-20 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
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

function OrderRow({ order }) {
  const href = `/admin/orders/${order.id}`;
  const status = statusMeta(order.status);
  const payment = paymentMeta(order.paymentStatus);

  return (
    <tr className="align-middle transition-colors hover:bg-ink-50/70">
      <td className="px-3 py-2.5">
        <Link
          href={href}
          className="font-mono text-[13px] font-medium text-ink-900 hover:text-brand-700 hover:underline"
        >
          {order.orderNumber}
        </Link>
        <p className="mt-0.5 text-xs text-ink-500">
          {shortDate(order.timeline.placedAt)}
        </p>
      </td>

      <td className="px-3 py-2.5">
        <p className="font-medium text-ink-800">{order.contact.name || "—"}</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {order.customerId ? (
            order.contact.email
          ) : (
            <span title="Checked out without an account">
              {order.contact.email} · guest
            </span>
          )}
        </p>
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-ink-600 tabular-nums">
        {number(order.unitCount)}
        <span className="text-ink-400">
          {" "}
          across {number(order.itemCount)}
        </span>
      </td>

      <td className="px-3 py-2.5 text-right font-medium text-ink-900 tabular-nums">
        {money(order.total)}
      </td>

      <td className="px-3 py-2.5">
        <Badge tone={payment.tone}>{payment.label}</Badge>
      </td>

      <td className="px-3 py-2.5">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>

      <td className="px-3 py-2.5 text-right">
        <Link
          href={href}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Open
        </Link>
      </td>
    </tr>
  );
}
