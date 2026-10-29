"use client";

import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Eye,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  SearchX,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StatGrid, StatTile } from "@/components/admin/ProductBits";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  cx,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  LinkButton,
  Modal,
  Select,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import {
  advanceOrder,
  confirmPayment,
  EMPTY_SUMMARY,
  getOrderSummary,
  listOrders,
  movesFor,
  ORDER_SORTS,
  ORDER_STATUS,
  PAYMENT_FILTERS,
  paymentMeta,
  REFUND_DUE_FILTER,
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
 * The writes here are the forward moves that come in batches — confirm
 * payment, pack, ship, deliver — applied to the ticked rows. Cancelling
 * is not one of them: it is irreversible, needs a reason, and is not a
 * thing to do to twenty orders by mistake, so it lives on the order's
 * own screen, behind View.
 */

const DEFAULT_QUERY = {
  search: "",
  status: "all",
  paymentStatus: "all",
  sort: "recent",
  page: 1,
};

const PAGE_SIZE = 25;

const allowed = (options, value) =>
  options.some((option) => option.value === value) ? value : "all";

/**
 * The filters a link can open the queue with — the dashboard's tiles link
 * here as /admin/orders?paymentStatus=pending and so on. Anything not in
 * the select options is ignored rather than sent to the API to be refused.
 */
function queryFromParams(params) {
  return {
    ...DEFAULT_QUERY,
    search: params.get("search") ?? "",
    status: allowed(STATUS_FILTERS, params.get("status")),
    paymentStatus:
      params.get("refundDue") === "true"
        ? REFUND_DUE_FILTER
        : allowed(PAYMENT_FILTERS, params.get("paymentStatus")),
  };
}

export default function OrdersPage() {
  // useSearchParams suspends during prerender, hence the boundary.
  return (
    <Suspense fallback={<SkeletonRows rows={8} className="mx-auto max-w-[1400px]" />}>
      <OrdersFromUrl />
    </Suspense>
  );
}

/**
 * Keyed on the query string, so following another filtered link — or the
 * sidebar back to the plain queue — starts from that link's filters
 * rather than keeping the ones already on screen.
 */
function OrdersFromUrl() {
  const params = useSearchParams();
  const key = params.toString();
  return <OrdersQueue key={key} initialQuery={queryFromParams(params)} />;
}

function OrdersQueue({ initialQuery }) {
  const [query, setQuery] = useState(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery.search);
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

  // The pinned search bar wraps to more lines as the window narrows, so
  // its height is measured onto the card for the column header to sit
  // beneath. A CSS variable rather than state: resizing should not
  // re-render every row.
  const headRef = useRef(null);
  useEffect(() => {
    const head = headRef.current;
    const card = head?.parentElement;
    if (!head || !card) return undefined;
    const observer = new ResizeObserver(() => {
      card.style.setProperty("--orders-head", `${head.offsetHeight}px`);
    });
    observer.observe(head);
    return () => observer.disconnect();
  }, []);

  // Ids, not rows: a refetch replaces every row object, and the
  // selection should survive that as long as the order is still shown.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDialog, setBulkDialog] = useState(null); // a BULK_ACTIONS key, or null
  const [bulkSeq, setBulkSeq] = useState(0);

  const openBulk = (name) => {
    // A fresh key per open, so the dialog's fields start blank.
    setBulkSeq((n) => n + 1);
    setBulkDialog(name);
  };

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

        // Past the end — rows on the last page left the result set since
        // it was opened. Step back to the real last page rather than
        // showing an empty one.
        const lastPage = Math.max(1, data.pagination?.totalPages ?? 1);
        if (query.page > lastPage) {
          setQuery((q) => (q.page > lastPage ? { ...q, page: lastPage } : q));
          return;
        }

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

  // A different page or filter is a different list; carrying a
  // selection across it would act on orders nobody can see. Reset
  // during render rather than in an effect, so no frame shows both.
  const [selectionQuery, setSelectionQuery] = useState(query);
  if (selectionQuery !== query) {
    setSelectionQuery(query);
    setSelectedIds(new Set());
  }

  const selection = useMemo(
    () => rows.filter((order) => selectedIds.has(order.id)),
    [rows, selectedIds],
  );
  const eligible = useMemo(() => eligibleByAction(selection), [selection]);
  const activeAction = BULK_ACTIONS.find((a) => a.key === bulkDialog);

  const allVisibleSelected =
    rows.length > 0 && rows.every((order) => selectedIds.has(order.id));

  const selectAll = (checked) =>
    setSelectedIds(checked ? new Set(rows.map((order) => order.id)) : new Set());

  const selectRow = (id, checked) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  // Orders that moved leave the selection; the ones that failed stay
  // ticked so they can be retried or opened.
  const afterBulk = (doneIds) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      doneIds.forEach((id) => next.delete(id));
      return next;
    });
    refresh();
  };

  const filtered =
    query.search !== "" ||
    query.status !== "all" ||
    query.paymentStatus !== "all";

  return (
    // The bottom padding clears the fixed bulk bar, which wraps to a few
    // lines on a phone, so the last rows can still be scrolled into view.
    <div
      className={cx(
        "mx-auto max-w-[1400px] space-y-5",
        selection.length > 0 && "pb-40 sm:pb-24",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            Orders
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Every order placed on the storefront, newest first. Click rows
            to select them and move them along together, or View to open one.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={refresh}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {summary.refundDue ? (
        <button
          type="button"
          onClick={() =>
            setQuery({ ...DEFAULT_QUERY, paymentStatus: REFUND_DUE_FILTER })
          }
          className="flex w-full items-start gap-3 rounded-xl bg-red-50 px-4 py-3 text-left text-sm text-red-800 ring-1 ring-red-200 transition-colors hover:bg-red-100"
        >
          <span className="font-semibold tabular-nums">
            {number(summary.refundDue)}
          </span>
          <span>
            {summary.refundDue === 1 ? "order needs" : "orders need"} a refund —
            paid for after it was cancelled, or paid twice. Refund in the
            Razorpay dashboard; the order clears itself when the refund lands.
            <span className="ml-1 font-medium underline">Show them</span>
          </span>
        </button>
      ) : null}

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
        {/* The search and filters stay pinned under the admin bar while
            the list scrolls, from `md` up. On a phone they wrap to four
            rows, and pinning that much would leave little room for the
            orders themselves. bg-white so rows do not show through. */}
        <div
          ref={headRef}
          className="rounded-t-xl bg-white md:sticky md:top-14 md:z-20"
        >
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
              // Full-width search and the selects two to a row on a phone;
              // from `sm` up they sit inline at their fixed widths.
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400"
                  />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="SB-001042, name, email or phone"
                    aria-label="Search orders"
                    className="pl-8"
                  />
                </div>
  
                <Select
                  value={query.status}
                  aria-label="Filter by status"
                  className="min-w-0 flex-1 basis-36 sm:flex-none sm:w-44"
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
                  className="min-w-0 flex-1 basis-36 sm:flex-none sm:w-40"
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
                  className="min-w-0 flex-1 basis-36 sm:flex-none sm:w-44"
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
        </div>

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
          <>
            {/* Below `md` the seven columns become one card per order. The
                table would only fit by scrolling sideways, and with the
                admin's scrollbars hidden nothing would say it scrolls. */}
            <div className="md:hidden">
              <div className="sticky top-14 z-10 border-b border-ink-200 bg-ink-50 px-3 py-2.5">
                <Checkbox
                  checked={allVisibleSelected}
                  label={
                    <span className="text-xs font-medium text-ink-600">
                      Select all on this page
                    </span>
                  }
                  onChange={(e) => selectAll(e.target.checked)}
                />
              </div>
              <ul className="divide-y divide-ink-100">
                {rows.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    selected={selectedIds.has(order.id)}
                    onSelect={(checked) => selectRow(order.id, checked)}
                  />
                ))}
              </ul>
            </div>

            {/* overflow-x-clip, not -auto: a scroll container would become
                what the header sticks to, and it would scroll away with
                the page. Clip does not create one, so the header stays
                pinned under the admin bar (h-14). */}
            <div className="hidden overflow-x-clip md:block">
              <table className="w-full border-collapse text-sm">
                {/* Opaque background and an inset shadow instead of a
                    border: a collapsed border does not travel with a
                    sticky header, and rows would show through. It sits
                    under the pinned search bar, whose height is measured
                    into --orders-head because it wraps. */}
                <thead className="sticky top-[calc(3.5rem_+_var(--orders-head,0px))] z-10">
                  <tr className="bg-ink-50 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase shadow-[inset_0_-1px_0_var(--color-ink-200)]">
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={allVisibleSelected}
                        aria-label="Select every order on this page"
                        onChange={(e) => selectAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-3 py-2.5">Order</th>
                    <th className="px-3 py-2.5">Customer</th>
                    <th className="px-3 py-2.5">Pieces</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5">Payment</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="w-20 px-3 py-2.5">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      selected={selectedIds.has(order.id)}
                      onSelect={(checked) => selectRow(order.id, checked)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/80 px-3 py-2.5">
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

      {/* Pinned to the bottom of the screen rather than the top of the
          table, so it stays in reach while ticking rows far down the
          page and never covers the sticky column header. Clears the
          sidebar from `lg`, like the save bars on the form screens. */}
      {selection.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-200 bg-brand-50/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
            <span className="text-sm font-medium text-brand-800">
              {selection.length} order{selection.length === 1 ? "" : "s"} selected
            </span>
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              {/* Every action is always shown, greyed out when none of the
                  selection can take it, so the bar does not rearrange
                  itself as boxes are ticked. The count says how many of
                  the selection it will actually touch. */}
              {BULK_ACTIONS.map((action) => {
                const count = eligible[action.key].length;
                const Icon = action.icon;
                return (
                  <Button
                    key={action.key}
                    size="sm"
                    variant={count ? action.variant : "secondary"}
                    disabled={count === 0}
                    title={
                      count === 0
                        ? `None of the selected orders can be ${action.verb}`
                        : undefined
                    }
                    onClick={() => openBulk(action.key)}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {action.label}
                    {count ? ` (${count})` : ""}
                  </Button>
                );
              })}

              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeAction ? (
        <BulkMoveDialog
          key={`${activeAction.key}-${bulkSeq}`}
          action={activeAction}
          orders={eligible[activeAction.key]}
          onClose={() => setBulkDialog(null)}
          onFinished={afterBulk}
        />
      ) : null}
    </div>
  );
}

/**
 * True when a click on a row landed on something with its own job — the
 * checkbox, the View button — so the row should not also toggle.
 */
const isInteractive = (target) =>
  Boolean(target.closest("a, button, input, label, select, textarea"));

/**
 * A click anywhere on a row or card ticks it, because the queue is
 * worked in batches; opening one order is the View button's job.
 */
const toggleOnClick = (selected, onSelect) => (e) => {
  if (isInteractive(e.target)) return;
  // Selecting text in a row should not count as a click on it.
  if (window.getSelection()?.toString()) return;
  onSelect(!selected);
};

function ViewButton({ order }) {
  return (
    <LinkButton
      href={`/admin/orders/${order.id}`}
      size="sm"
      variant="secondary"
      aria-label={`View ${order.orderNumber}`}
    >
      <Eye className="size-3.5" aria-hidden="true" />
      View
    </LinkButton>
  );
}

/** The phone layout of a row: the same fields, tap to tick, View to open. */
function OrderCard({ order, selected, onSelect }) {
  const status = statusMeta(order.status);
  const payment = paymentMeta(order.paymentStatus);

  return (
    <li
      onClick={toggleOnClick(selected, onSelect)}
      className={cx(
        "flex cursor-pointer items-start gap-3 px-3 py-3 transition-colors active:bg-ink-50",
        selected && "bg-brand-50/40",
      )}
    >
      <Checkbox
        className="mt-1"
        checked={selected}
        aria-label={`Select ${order.orderNumber}`}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-mono text-[13px] font-medium break-all text-ink-900">
            {order.orderNumber}
          </span>
          <span className="shrink-0 text-sm font-medium text-ink-900 tabular-nums">
            {money(order.total)}
          </span>
        </div>

        <div className="min-w-0 text-sm">
          <p className="font-medium break-words text-ink-800">
            {order.contact.name || "—"}
          </p>
          <p className="mt-0.5 text-xs break-all text-ink-500">
            {order.contact.email || order.contact.phone}
            {order.customerId ? null : " · guest"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-500">
          <Badge tone={payment.tone}>{payment.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="tabular-nums">
            {number(order.unitCount)} across {number(order.itemCount)} ·{" "}
            {shortDate(order.timeline.placedAt)}
          </span>
        </div>
      </div>
      <ViewButton order={order} />
    </li>
  );
}

/**
 * A click on the row ticks it; View opens it. The order number stays a
 * real link too, so middle-click and keyboard users can still open one.
 */
function OrderRow({ order, selected, onSelect }) {
  const href = `/admin/orders/${order.id}`;
  const status = statusMeta(order.status);
  const payment = paymentMeta(order.paymentStatus);

  return (
    <tr
      onClick={toggleOnClick(selected, onSelect)}
      className={cx(
        "cursor-pointer align-middle transition-colors hover:bg-ink-50/70",
        selected && "bg-brand-50/40 hover:bg-brand-50/60",
      )}
    >
      <td className="w-10 px-3 py-2.5">
        <Checkbox
          checked={selected}
          aria-label={`Select ${order.orderNumber}`}
          onChange={(e) => onSelect(e.target.checked)}
        />
      </td>

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
            order.contact.email || order.contact.phone
          ) : (
            <span title="Checked out without an account">
              {order.contact.email || order.contact.phone} · guest
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
        <ViewButton order={order} />
      </td>
    </tr>
  );
}

// ============================================================
// BULK MOVES
// ============================================================
//
// The forward moves the order screen offers, applied to a selection.
// Each one calls the same per-order endpoint the order screen uses, one
// order at a time, rather than a bulk endpoint: a pack emails the
// customer, each move is checked against order.policy.js on its own,
// and one order that has moved on since the list loaded (a 409) should
// fail alone, not take the other nineteen with it.
//
// Which selected orders an action applies to comes from movesFor(), the
// same table that decides the order screen's buttons, so the bar can
// never offer a move the API would refuse.

/**
 * The key a move is filed under here. "advance" covers both shipped and
 * delivered, which are different buttons, so those take the status.
 */
const bulkKey = (move) => (move.kind === "advance" ? move.status : move.kind);

/**
 * One entry per button in the bulk bar, in the order the work happens.
 *
 *   shared     one field filled once for the whole batch
 *   perOrder   one field per order (a tracking number is per parcel)
 *   run        the call for one order, given what was typed
 */
const BULK_ACTIONS = [
  {
    key: "confirm",
    label: "Confirm payment",
    verb: "confirmed",
    icon: BadgeCheck,
    variant: "primary",
    description:
      "Marks each order paid and accepts it, so it moves into the pack queue.",
    perOrder: {
      label: "Payment reference",
      placeholder: "UPI / bank ref (optional)",
      required: false,
    },
    run: (order, { perOrder }) =>
      confirmPayment(order.id, { reference: perOrder }),
  },
  {
    key: "pack",
    label: "Mark packed",
    verb: "packed",
    icon: PackageCheck,
    variant: "primary",
    description:
      "Each customer is emailed their own tracking number straight away.",
    shared: {
      label: "Courier",
      placeholder: "e.g. Delhivery, DTDC, India Post",
      hint: "Used for every order below.",
      required: true,
    },
    perOrder: {
      label: "Tracking number",
      placeholder: "Tracking number",
      required: true,
    },
    run: (order, { shared, perOrder }) =>
      advanceOrder(order.id, ORDER_STATUS.PACKED, {
        shipment: { courierName: shared, trackingNumber: perOrder },
      }),
  },
  {
    key: ORDER_STATUS.SHIPPED,
    label: "Mark shipped",
    verb: "shipped",
    icon: Truck,
    variant: "primary",
    description: "Once shipped an order can no longer be cancelled.",
    run: (order) => advanceOrder(order.id, ORDER_STATUS.SHIPPED),
  },
  {
    key: ORDER_STATUS.DELIVERED,
    label: "Mark delivered",
    verb: "delivered",
    icon: CircleCheck,
    variant: "primary",
    description: "Completes each order. Nothing further can be done to it.",
    run: (order) => advanceOrder(order.id, ORDER_STATUS.DELIVERED),
  },
  // No cancel, deliberately. Cancelling is irreversible and puts stock
  // back on the shelf, so it is done one order at a time from the
  // order's own screen, with that order's details in front of you.
];

/**
 * The selected orders each bulk action applies to, keyed by action.
 * Moves with no entry above (cancel) are skipped.
 */
function eligibleByAction(selection) {
  const out = Object.fromEntries(BULK_ACTIONS.map((a) => [a.key, []]));
  for (const order of selection) {
    for (const move of movesFor(order.status)) {
      out[bulkKey(move)]?.push(order);
    }
  }
  return out;
}

/** Runs `fn` over each order in turn, reporting every outcome as it lands. */
async function runEach(orders, fn, onResult) {
  for (const order of orders) {
    try {
      await fn(order);
      onResult(order.id, { ok: true });
    } catch (err) {
      onResult(order.id, {
        ok: false,
        message:
          Object.values(err?.fields ?? {})[0] ||
          err?.message ||
          "Could not update this order.",
      });
    }
  }
}

function BulkResult({ result }) {
  if (!result) return null;
  return result.ok ? (
    <Badge tone="green">Done</Badge>
  ) : (
    <span className="text-xs text-red-700">{result.message}</span>
  );
}

/**
 * One dialog for every bulk action, shaped by its BULK_ACTIONS entry.
 *
 * The orders are captured when it opens — it is keyed per open — so
 * the list refreshing underneath does not reshuffle the rows being
 * worked through. Orders that went through are locked with a tick;
 * the button then retries only the ones that failed.
 */
function BulkMoveDialog({ action, orders: initialOrders, onClose, onFinished }) {
  const toast = useToast();
  const [orders] = useState(initialOrders);
  const [shared, setShared] = useState("");
  const [perOrder, setPerOrder] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);

  const pending = orders.filter((o) => !results[o.id]?.ok);
  const ready =
    pending.length > 0 &&
    (!action.shared?.required || shared.trim() !== "") &&
    (!action.perOrder?.required ||
      pending.every((o) => (perOrder[o.id] ?? "").trim() !== ""));

  async function run() {
    setBusy(true);
    const done = [];

    await runEach(
      pending,
      (order) =>
        action.run(order, { shared, perOrder: perOrder[order.id] ?? "" }),
      (id, result) => {
        if (result.ok) done.push(id);
        setResults((current) => ({ ...current, [id]: result }));
      },
    );

    setBusy(false);
    onFinished(done);

    const plural = (n) => `${n} order${n === 1 ? "" : "s"}`;
    if (done.length === pending.length) {
      toast.success(`${plural(done.length)} ${action.verb}.`);
      onClose();
    } else {
      toast.error(
        `${pending.length - done.length} of ${plural(pending.length)} could not be ${action.verb}. See the list.`,
      );
    }
  }

  // Enter in a per-order box jumps to the next one, so a scanner or a
  // fast typist can run down the list without the mouse.
  const nextOnEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.closest("ul")?.querySelectorAll("input:not(:disabled)") ?? [],
    );
    list[list.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`${action.label} — ${orders.length} order${orders.length === 1 ? "" : "s"}`}
      description={action.description}
      size={action.perOrder ? "lg" : "md"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {Object.keys(results).length ? "Close" : "Back"}
          </Button>
          <Button
            variant={action.variant}
            busy={busy}
            disabled={!ready}
            onClick={run}
          >
            {action.label} ({pending.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action.shared ? (
          <Field
            label={action.shared.label}
            required={action.shared.required}
            hint={action.shared.hint}
          >
            <Input
              value={shared}
              placeholder={action.shared.placeholder}
              disabled={busy}
              onChange={(e) => setShared(e.target.value)}
            />
          </Field>
        ) : null}

        <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
          {orders.map((order) => {
            const result = results[order.id];
            return (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-mono text-[13px] font-medium text-ink-900">
                    {order.orderNumber}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {order.contact.name || "—"} · {money(order.total)} ·{" "}
                    {statusMeta(order.status).label}
                  </p>
                </div>

                {action.perOrder ? (
                  <Input
                    className="w-full sm:w-56"
                    aria-label={`${action.perOrder.label} for ${order.orderNumber}`}
                    placeholder={action.perOrder.placeholder}
                    value={perOrder[order.id] ?? ""}
                    disabled={busy || result?.ok}
                    invalid={result ? !result.ok : false}
                    onKeyDown={nextOnEnter}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPerOrder((current) => ({ ...current, [order.id]: value }));
                    }}
                  />
                ) : null}

                {result ? (
                  <div className={action.perOrder ? "w-full sm:w-auto" : undefined}>
                    <BulkResult result={result} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
