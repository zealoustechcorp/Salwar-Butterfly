"use client";

import {
  ChevronLeft,
  ChevronRight,
  Minus,
  PackagePlus,
  Plus,
  Search,
  SearchX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatTile } from "@/components/admin/ProductBits";
import { ProductCover } from "@/components/admin/ProductThumb";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cx,
  EmptyState,
  ErrorNotice,
  Input,
  Modal,
  Select,
  SkeletonRows,
  useToast,
} from "@/components/admin/ui";
import {
  adjustStock,
  bulkAdjustStock,
  EMPTY_SUMMARY,
  listInventory,
  setStock,
  STOCK_SORTS,
} from "@/lib/api/inventory";
import { getReference } from "@/lib/api/products";
import { number, relativeDate } from "@/lib/format";
import { STOCK_LABEL, STOCK_TONE } from "@/lib/stock";

/**
 * Inventory (F-04) — stock across the whole catalogue, one row per size.
 *
 * The product screens are organised by product: open a piece, see its
 * sizes. That is the wrong shape for the job this screen does, which is
 * "what is running out, anywhere?" — a question that has to be asked of
 * every size at once and sorted by how little is left. So the row here
 * is the size, and its product rides along for context.
 *
 * Two ways to write, matching the two things that actually happen in a
 * shop:
 *
 *   ± steppers   a movement. One arrived, one was damaged. Sent as a
 *                delta so two people counting the same delivery both
 *                land instead of the second overwriting the first.
 *
 *   typing a
 *   new count    a stock-take. Sent with the figure the row was showing,
 *                so a correction typed against a stale page is refused
 *                rather than quietly undoing someone else's edit.
 *
 * Selecting rows adds a third: one delta applied to many sizes in a
 * single transaction, which is what receiving a delivery looks like.
 */

const DEFAULT_QUERY = {
  search: "",
  status: "all",
  categoryId: "all",
  sort: "stock_asc",
  page: 1,
};

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { value: "all", label: "Any stock level" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "in_stock", label: "In stock" },
  { value: "unavailable", label: "Not on sale" },
];

export default function InventoryPage() {
  const toast = useToast();

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [reload, setReload] = useState(0);
  const [reference, setReference] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [restockOpen, setRestockOpen] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);

  // Request and outcome in one object: comparing the stored query with
  // the current one says a refetch is in flight without a second flag.
  const [result, setResult] = useState({
    status: "loading",
    query: null,
    rows: [],
    summary: EMPTY_SUMMARY,
    pagination: null,
    error: null,
  });

  // Debounced, so a search does not fire a request per keystroke. A new
  // term also rewinds to page 1 — the old offset means nothing against a
  // different result set.
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

  // A category outage should not blank the table; the filter just loses
  // its options.
  useEffect(() => {
    const controller = new AbortController();
    getReference({ signal: controller.signal })
      .then(setReference)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listInventory({ ...query, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setResult({ status: "ready", query, ...data, error: null });
        // A row that scrolled out of the result set can no longer be
        // acted on, so it must not stay selected and counted.
        setSelectedIds((current) => {
          if (current.size === 0) return current;
          const visible = new Set(data.rows.map((row) => row.id));
          const next = new Set([...current].filter((id) => visible.has(id)));
          return next.size === current.size ? current : next;
        });
      })
      .catch((error) => {
        if (active && error?.name !== "AbortError") {
          setResult((current) => ({ ...current, status: "error", query, error }));
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const { rows, summary, pagination, error } = result;
  const loading = result.status === "loading" || result.query !== query;

  const filtersDirty =
    query.search !== "" ||
    query.status !== "all" ||
    query.categoryId !== "all" ||
    query.sort !== DEFAULT_QUERY.sort;

  const selection = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );

  /**
   * Replaces one row in place rather than refetching.
   *
   * Deliberate: the default sort is lowest-stock-first, so a refetch
   * after every edit would slide the row the admin just touched to a
   * different position — often off the page — while they are still
   * working down the list. The order refreshes on the next load.
   */
  const patchRow = useCallback((updated) => {
    setResult((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === updated.id ? updated : row)),
    }));
  }, []);

  async function move(row, delta) {
    setRowBusy(row.id);
    try {
      const updated = await adjustStock(row.id, delta);
      patchRow(updated);
    } catch (err) {
      toast.error(err.message || "Could not change that stock count.");
      // The message says what the true count is, so show it.
      refresh();
    } finally {
      setRowBusy(null);
    }
  }

  async function count(row, next) {
    if (next === row.stockQuantity) return;

    setRowBusy(row.id);
    try {
      const updated = await setStock(row.id, next, row.stockQuantity);
      patchRow(updated);
      toast.success(`${updated.product.name} (${updated.size}) set to ${updated.stockQuantity}`);
    } catch (err) {
      toast.error(err.message || "Could not save that count.");
      refresh();
    } finally {
      setRowBusy(null);
    }
  }

  async function applyBulk(delta) {
    try {
      const updated = await bulkAdjustStock(
        selection.map((row) => ({ variantId: row.id, delta })),
      );
      for (const row of updated) patchRow(row);
      toast.success(
        `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} ${
          Math.abs(delta) === 1 ? "unit" : "units"
        } across ${updated.length} size${updated.length === 1 ? "" : "s"}`,
      );
      setSelectedIds(new Set());
      setRestockOpen(false);
    } catch (err) {
      // The whole batch was rejected, so nothing on screen changed —
      // but say so, because "nothing happened" reads like a bug.
      toast.error(err.message || "Nothing was changed.");
    }
  }

  const allVisibleSelected = rows.length > 0 && selection.length === rows.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Inventory</h1>
          <p className="mt-1 text-sm text-ink-600">
            Every size in the catalogue, emptiest first. A size is low below{" "}
            {summary.thresholds?.lowStockBelow ?? 10} and out of stock at zero.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Units on hand"
          value={number(summary.totalUnits)}
          sub={`across ${number(summary.totalSizes)} sizes on sale`}
          tone="green"
        />
        <StatTile
          label="Running low"
          value={number(summary.lowStock.sizes)}
          sub={`${number(summary.lowStock.products)} product${summary.lowStock.products === 1 ? "" : "s"} affected`}
          tone={summary.lowStock.sizes ? "amber" : "neutral"}
        />
        <StatTile
          label="Out of stock"
          value={number(summary.outOfStock.sizes)}
          sub={`${number(summary.outOfStock.products)} product${summary.outOfStock.products === 1 ? "" : "s"} affected`}
          tone={summary.outOfStock.sizes ? "red" : "neutral"}
        />
        <StatTile
          label="No sizes yet"
          value={number(summary.productsWithoutSizes)}
          sub="products nothing can be bought in"
          tone={summary.productsWithoutSizes ? "amber" : "neutral"}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200/80 p-3">
          <div className="relative min-w-56 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by product name, slug, or an exact size…"
              className="pl-8"
              aria-label="Search inventory"
            />
          </div>

          <Select
            value={query.status}
            onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))}
            aria-label="Filter by stock level"
            className="w-auto"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </Select>

          <Select
            value={query.categoryId}
            onChange={(e) => setQuery((q) => ({ ...q, categoryId: e.target.value, page: 1 }))}
            aria-label="Filter by category"
            className="w-auto"
          >
            <option value="all">All categories</option>
            {(reference?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <Select
            value={query.sort}
            onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value, page: 1 }))}
            aria-label="Sort"
            className="w-auto"
          >
            {STOCK_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Select>

          {filtersDirty ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setQuery(DEFAULT_QUERY);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        {selection.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50/70 px-3 py-2">
            <span className="text-sm font-medium text-brand-800">
              {selection.length} size{selection.length === 1 ? "" : "s"} selected
            </span>
            <span className="text-xs text-brand-700">
              holding {number(selection.reduce((sum, row) => sum + row.stockQuantity, 0))} units
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRestockOpen(true)}>
                <PackagePlus className="size-3.5" aria-hidden="true" />
                Adjust stock
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={refresh} />
          </div>
        ) : loading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-6" aria-hidden="true" />}
            title={filtersDirty ? "Nothing matches those filters" : "No sizes to count yet"}
            description={
              filtersDirty
                ? "Try a wider stock level, or clear the filters."
                : "Stock appears here once a product has sizes. Add them on the product's own screen."
            }
            action={
              filtersDirty ? (
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
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      checked={allVisibleSelected}
                      aria-label="Select every size on this page"
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked ? new Set(rows.map((row) => row.id)) : new Set(),
                        )
                      }
                    />
                  </th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Size</th>
                  <th className="px-3 py-2.5 text-center">Stock</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <InventoryRow
                    key={row.id}
                    row={row}
                    busy={rowBusy === row.id}
                    selected={selectedIds.has(row.id)}
                    onSelect={(checked) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                    onMove={(delta) => move(row, delta)}
                    onCount={(value) => count(row, value)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-ink-200/80 px-3 py-2.5">
            <p className="text-xs text-ink-500">
              Page {pagination.page} of {pagination.totalPages} · {number(pagination.total)} sizes
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

      {/*
        Keyed on the open state so each opening mounts a fresh dialog:
        the quantity field starts back at 1 without an effect reaching
        in to reset it after the fact.
      */}
      <RestockDialog
        key={restockOpen ? "restock-open" : "restock-closed"}
        open={restockOpen}
        onClose={() => setRestockOpen(false)}
        rows={selection}
        onApply={applyBulk}
      />
    </div>
  );
}

function InventoryRow({ row, busy, selected, onSelect, onMove, onCount }) {
  // The field holds a draft so a keystroke does not fight the saved
  // value mid-edit. When the saved value does change — this row was
  // just written, or a bulk adjustment moved it — the draft is
  // reconciled during render rather than in an effect, so the input
  // never paints one frame showing the stale number.
  const [draft, setDraft] = useState(String(row.stockQuantity));
  const [lastSaved, setLastSaved] = useState(row.stockQuantity);

  if (lastSaved !== row.stockQuantity) {
    setLastSaved(row.stockQuantity);
    setDraft(String(row.stockQuantity));
  }

  const commit = () => {
    const value = Number(draft);

    if (!Number.isInteger(value) || value < 0) {
      setDraft(String(row.stockQuantity));
      return;
    }

    onCount(value);
  };

  return (
    <tr className={cx(selected && "bg-brand-50/40", !row.active && "bg-ink-50/50")}>
      <td className="px-3 py-2">
        <Checkbox
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select ${row.product.name} size ${row.size}`}
        />
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <ProductCover product={row.product} size={36} />
          <div className="min-w-0">
            <Link
              href={`/admin/products/${row.productId}`}
              className="block truncate font-medium text-ink-900 hover:text-brand-700"
            >
              {row.product.name}
            </Link>
            <p className="truncate text-[11px] text-ink-500">
              {row.product.categoryName ?? "—"}
              {row.product.active ? "" : " · product inactive"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-2">
        <span className="inline-flex min-w-10 justify-center rounded-md bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">
          {row.size}
        </span>
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || row.stockQuantity === 0}
            aria-label={`Remove one from ${row.product.name} size ${row.size}`}
            className="px-1.5"
            onClick={() => onMove(-1)}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </Button>

          <Input
            type="number"
            min={0}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setDraft(String(row.stockQuantity));
            }}
            className="tabular h-8 w-20 px-2 py-0 text-center"
            aria-label={`Stock for ${row.product.name} size ${row.size}`}
          />

          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Add one to ${row.product.name} size ${row.size}`}
            className="px-1.5"
            onClick={() => onMove(1)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </td>

      <td className="px-3 py-2">
        <Badge tone={STOCK_TONE[row.stockStatus] ?? "slate"}>
          {STOCK_LABEL[row.stockStatus] ?? row.stockStatus}
        </Badge>
      </td>

      <td className="px-3 py-2 text-xs text-ink-500">{relativeDate(row.updatedAt)}</td>
    </tr>
  );
}

/**
 * One adjustment applied to every selected size — receiving a delivery.
 *
 * A delta rather than a count, because the sizes selected hold different
 * amounts: "five of each arrived" is meaningful across a selection,
 * "set them all to five" is almost never what anyone means.
 */
function RestockDialog({ open, onClose, rows, onApply }) {
  const [value, setValue] = useState("1");
  const [busy, setBusy] = useState(false);

  const delta = Number(value);
  const valid = Number.isInteger(delta) && delta !== 0;

  // A negative adjustment cannot take any selected size below zero —
  // the API refuses the whole batch, so it is worth saying up front
  // which row would block it.
  const blocked = valid && delta < 0 ? rows.filter((row) => row.stockQuantity + delta < 0) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust stock"
      description={`Applies to all ${rows.length} selected size${rows.length === 1 ? "" : "s"}, as one change. If any line cannot be applied, none of them are.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={!valid || blocked.length > 0}
            onClick={async () => {
              setBusy(true);
              await onApply(delta);
              setBusy(false);
            }}
          >
            {delta > 0 ? `Add ${delta} to each` : `Remove ${Math.abs(delta) || ""} from each`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="restock-delta" className="text-xs font-medium text-ink-700">
            Change each size by
          </label>
          <Input
            id="restock-delta"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tabular mt-1 w-32 text-center"
          />
          <p className="mt-1 text-[11px] text-ink-500">
            Positive to receive stock, negative to write it off.
          </p>
        </div>

        {blocked.length > 0 ? (
          <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800 ring-1 ring-inset ring-red-200">
            {blocked.length} selected size{blocked.length === 1 ? "" : "s"} do not hold enough for
            that — {blocked[0].product.name} ({blocked[0].size}) has only {blocked[0].stockQuantity}.
            Nothing would be changed.
          </p>
        ) : null}

        <div className="max-h-48 overflow-y-auto rounded-lg ring-1 ring-ink-200">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-ink-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-1.5 text-ink-700">
                    {row.product.name}{" "}
                    <span className="font-semibold text-ink-500">({row.size})</span>
                  </td>
                  <td className="tabular px-3 py-1.5 text-right text-ink-500">
                    {row.stockQuantity}
                    {valid ? (
                      <span className={cx("ml-1.5 font-semibold", delta > 0 ? "text-emerald-700" : "text-red-700")}>
                        → {Math.max(row.stockQuantity + delta, 0)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
