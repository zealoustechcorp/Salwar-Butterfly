"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Percent,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DeleteDialog } from "@/components/admin/DeleteDialog";
import { DiscountDialog } from "@/components/admin/DiscountDialog";
import { ActiveDot, PriceCell, StatGrid, StatTile } from "@/components/admin/ProductBits";
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
  LinkButton,
  Select,
  SkeletonRows,
  Toggle,
  useToast,
} from "@/components/admin/ui";
import { getReference, listProducts, setActive } from "@/lib/api/products";
import { EMPTY_SUMMARY, getVariantSummaries } from "@/lib/api/variants";
import { number, relativeDate } from "@/lib/format";
import { STOCK_LABEL, STOCK_STATUS, STOCK_TONE } from "@/lib/stock";

const DEFAULT_QUERY = {
  search: "",
  categoryId: "all",
  status: "all",
  discount: "all",
  featured: "all",
  stock: "all",
  sort: "newest",
  page: 1,
};

export default function ProductsListPage() {
  const toast = useToast();

  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [view, setView] = useState("grid"); // "grid" | "list"
  const [reload, setReload] = useState(0);
  const [reference, setReference] = useState(null);
  const [summaries, setSummaries] = useState({});

  // One state object holding the request and its outcome together. Comparing the
  // stored query against the current one tells us a refetch is in flight without
  // a second `loading` flag — and keeps every setState off the effect's
  // synchronous path, which is what React 19 wants.
  const [result, setResult] = useState({ status: "loading", query: null, data: null, error: null });

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dialog, setDialog] = useState(null); // "discount" | "delete"
  // Ids with a storefront toggle in flight — a set, so flipping a second
  // product before the first answers does not re-enable the first.
  const [rowBusy, setRowBusy] = useState(() => new Set());

  // Debounced search — a real API call per keystroke would be wasteful.
  // A changed term also rewinds to page 1: the old offset is meaningless
  // against a new result set.
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((q) => (q.search === searchInput ? q : { ...q, search: searchInput, page: 1 })),
      250,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A category outage should not blank the product list, so the filter
  // simply loses its options.
  useEffect(() => {
    const controller = new AbortController();
    getReference({ signal: controller.signal })
      .then(setReference)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Stock roll-ups for every product in one request, rather than one per
  // row. Refreshed with the list, since activating or deleting a product
  // changes what it should show.
  useEffect(() => {
    const controller = new AbortController();
    getVariantSummaries({ signal: controller.signal })
      .then(setSummaries)
      .catch(() => {});
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    listProducts(query, { signal: controller.signal })
      .then((data) => {
        if (active) setResult({ status: "ready", query, data, error: null });
      })
      .catch((err) => {
        if (active && err?.name !== "AbortError")
          setResult((current) => ({ ...current, status: "error", query, error: err }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [query, reload]);

  const load = useCallback(() => setReload((n) => n + 1), []);

  const { data, error } = result;
  const stats = data?.stats ?? null;
  const loading = result.status === "loading" || result.query !== query;

  const categoryById = useMemo(
    () => new Map((reference?.categories ?? []).map((category) => [category.id, category])),
    [reference],
  );

  // The API returns `category_id` only, so the name is joined here from
  // the reference load rather than fetched per row.
  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .map((product) => ({
          ...product,
          categoryName: categoryById.get(product.categoryId)?.name ?? "—",
          categoryActive: categoryById.get(product.categoryId)?.active ?? true,
          stock: summaries[product.id] ?? EMPTY_SUMMARY,
        })),
    // The stock filter is applied by listProducts, before the page is
    // cut, so the pager and the counts describe the filtered set.
    [data, categoryById, summaries],
  );

  const selection = useMemo(
    () => rows.filter((product) => selectedIds.has(product.id)),
    [rows, selectedIds],
  );

  /**
   * Counted over the whole catalogue, not the page — a header figure
   * that changed when you paged would be misleading. A product missing
   * from `summaries` has no variant rows at all, which is its own
   * problem worth surfacing.
   */
  const stockTotals = useMemo(() => {
    const all = data?.stats ? Object.values(summaries) : [];
    const productCount = data?.total ?? 0;

    return {
      units: all.reduce((sum, entry) => sum + entry.totalStock, 0),
      sizes: all.reduce((sum, entry) => sum + entry.sizeCount, 0),
      outOfStock: all.filter((entry) => entry.lowestStatus === "out_of_stock").length,
      noSizes: Math.max(0, productCount - all.length),
    };
  }, [summaries, data]);

  const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id));
  const someSelected = rows.some((p) => selectedIds.has(p.id));

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((p) => p.id)));
  }

  function toggleProduct(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function refresh() {
    clearSelection();
    load();
  }

  async function toggleRowActive(product) {
    setRowBusy((current) => new Set(current).add(product.id));
    try {
      const outcome = await setActive({ productIds: [product.id], active: !product.active });
      toast.success(outcome.message);
      load();
    } catch (err) {
      toast.error(err.message || "Could not change availability.");
    } finally {
      setRowBusy((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  }

  async function bulkSetActive(active) {
    try {
      const outcome = await setActive({ productIds: selection.map((p) => p.id), active });
      toast.success(outcome.message);
      refresh();
    } catch (err) {
      toast.error(err.message || "Bulk update failed.");
    }
  }

  const filtersDirty =
    JSON.stringify({ ...query, search: "", page: 1 }) !==
      JSON.stringify({ ...DEFAULT_QUERY, search: "", page: 1 }) || query.search;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <PageHeader />

      <StatGrid cols={4}>
        <StatTile
          label="Products"
          value={stats ? number(stats.total) : "—"}
          sub={stats ? `${stats.active} active · ${stats.inactive} inactive` : " "}
        />
        <StatTile
          label="Units on hand"
          value={number(stockTotals.units)}
          sub={`${number(stockTotals.sizes)} sizes across the catalogue`}
          tone="green"
        />
        <StatTile
          label="On offer"
          value={stats ? number(stats.discounted) : "—"}
          sub="discount percentage above zero"
          tone="brand"
        />
        <StatTile
          label="Needs attention"
          value={number(stockTotals.outOfStock + stockTotals.noSizes)}
          sub={`${stockTotals.outOfStock} out of stock · ${stockTotals.noSizes} with no sizes`}
          tone={stockTotals.outOfStock || stockTotals.noSizes ? "amber" : "neutral"}
        />
      </StatGrid>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200/80 p-3">
          <div className="relative w-full flex-1 sm:w-auto sm:min-w-56">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, slug or description…"
              className="pl-8"
              aria-label="Search products"
            />
          </div>

          {/* Two filters a row on a phone, where six auto-width dropdowns
              would wrap into a ragged staircase. From `sm` the wrapper
              dissolves and they flow in the bar exactly as before. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:contents">
            <Select
              value={query.categoryId}
              onChange={(e) => setQuery((q) => ({ ...q, categoryId: e.target.value, page: 1 }))}
              aria-label="Filter by category"
              className="w-full sm:w-auto"
            >
              <option value="all">All categories</option>
              {(reference?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>

            <Select
              value={query.status}
              onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value, page: 1 }))}
              aria-label="Filter by status"
              className="w-full sm:w-auto"
            >
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>

            <Select
              value={query.discount}
              onChange={(e) => setQuery((q) => ({ ...q, discount: e.target.value, page: 1 }))}
              aria-label="Filter by offer"
              className="w-full sm:w-auto"
            >
              <option value="all">Any price</option>
              <option value="discounted">On offer</option>
              <option value="full_price">Full price</option>
            </Select>

            <Select
              value={query.stock}
              onChange={(e) => setQuery((q) => ({ ...q, stock: e.target.value, page: 1 }))}
              aria-label="Filter by stock"
              className="w-full sm:w-auto"
            >
              <option value="all">Any stock</option>
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
              <option value="unavailable">No sizes on sale</option>
            </Select>

            <Select
              value={query.featured}
              onChange={(e) => setQuery((q) => ({ ...q, featured: e.target.value, page: 1 }))}
              aria-label="Filter by featured"
              className="w-full sm:w-auto"
            >
              <option value="all">Featured or not</option>
              <option value="featured">Featured</option>
              <option value="not_featured">Not featured</option>
            </Select>

            <Select
              value={query.sort}
              onChange={(e) => setQuery((q) => ({ ...q, sort: e.target.value, page: 1 }))}
              aria-label="Sort"
              className="w-full sm:w-auto"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="price_desc">Price high → low</option>
              <option value="price_asc">Price low → high</option>
              <option value="discount_desc">Biggest offer</option>
            </Select>
          </div>

          {filtersDirty ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setQuery(DEFAULT_QUERY);
              }}
            >
              Clear
            </Button>
          ) : null}

          <div
            role="group"
            aria-label="Layout"
            className="ml-auto flex items-center gap-0.5 rounded-lg bg-white p-0.5 ring-1 ring-inset ring-ink-300"
          >
            <ViewToggleButton
              active={view === "grid"}
              onClick={() => setView("grid")}
              title="Grid view"
              icon={<LayoutGrid aria-hidden="true" className="size-4" />}
            />
            <ViewToggleButton
              active={view === "list"}
              onClick={() => setView("list")}
              title="List view"
              icon={<List aria-hidden="true" className="size-4" />}
            />
          </div>
        </div>

        {data?.truncated || summaries.truncated ? (
          <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            The catalogue is larger than this screen reads in one go, so the list, counts or stock
            figures are partial. Narrow the search or filters to see the rest.
          </p>
        ) : null}

        {selection.length ? (
          <BulkBar
            count={selection.length}
            onClear={clearSelection}
            onActivate={() => bulkSetActive(true)}
            onDeactivate={() => bulkSetActive(false)}
            onDiscount={() => setDialog("discount")}
            onDelete={() => setDialog("delete")}
          />
        ) : null}

        {error ? (
          <div className="p-4">
            <ErrorNotice error={error} onRetry={load} />
          </div>
        ) : loading && !data ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<SearchX aria-hidden="true" />}
            title={data?.total ? "No products match these filters" : "No products yet"}
            description={
              data?.total
                ? "Adjust the search or filters above."
                : "The catalogue is empty. Add the first product, or upload a batch into one category."
            }
            action={
              <LinkButton variant="primary" href="/admin/products/new">
                Add product
              </LinkButton>
            }
          />
        ) : view === "list" ? (
          <>
            {/* Below `md` the list becomes stacked cards: an 880px table in a
                phone-width card would scroll sideways with no scrollbar to say
                so, hiding the price and every action off the right edge. */}
            <div className={cx("space-y-2 bg-ink-50/50 p-3 md:hidden", loading && "opacity-60")}>
              <div className="flex items-center px-1">
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={`Select all ${rows.length} product${rows.length === 1 ? "" : "s"} on this page`}
                  className={cx(!allSelected && someSelected && "opacity-70")}
                />
              </div>
              <ul className="space-y-2">
                {rows.map((product) => (
                  <ProductListCard
                    key={product.id}
                    product={product}
                    selected={selectedIds.has(product.id)}
                    busy={rowBusy.has(product.id)}
                    onToggleSelect={() => toggleProduct(product.id)}
                    onToggleActive={() => toggleRowActive(product)}
                  />
                ))}
              </ul>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                    <th className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all products on this page"
                        className={cx(!allSelected && someSelected && "opacity-70")}
                      />
                    </th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Price</th>
                    <th className="px-3 py-2.5">Sizes & stock</th>
                    <th className="px-3 py-2.5">Storefront</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={cx("divide-y divide-ink-100", loading && "opacity-60")}>
                  {rows.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      selected={selectedIds.has(product.id)}
                      busy={rowBusy.has(product.id)}
                      onToggleSelect={() => toggleProduct(product.id)}
                      onToggleActive={() => toggleRowActive(product)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={cx("space-y-3 bg-ink-50/50 p-3 sm:p-4", loading && "opacity-60")}>
            <div className="flex items-center px-1">
              <Checkbox
                checked={allSelected}
                onChange={toggleAll}
                label={`Select all ${rows.length} product${rows.length === 1 ? "" : "s"} on this page`}
                className={cx(!allSelected && someSelected && "opacity-70")}
              />
            </div>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {rows.map((product) => (
                <ProductGridCard
                  key={product.id}
                  product={product}
                  selected={selectedIds.has(product.id)}
                  busy={rowBusy.has(product.id)}
                  onToggleSelect={() => toggleProduct(product.id)}
                  onToggleActive={() => toggleRowActive(product)}
                />
              ))}
            </ul>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200/80 px-4 py-3 text-xs text-ink-500">
          <span>
            Showing{" "}
            <strong className="text-ink-800">
              {rows.length
                ? `${(data.page - 1) * data.limit + 1}–${(data.page - 1) * data.limit + rows.length}`
                : 0}
            </strong>{" "}
            of <strong className="text-ink-800">{data?.matched ?? 0}</strong> matching ·{" "}
            {data?.total ?? 0} in catalogue
          </span>
          <Pager
            page={data?.page ?? 1}
            pages={data?.pages ?? 1}
            onPage={(n) => setQuery((q) => ({ ...q, page: n }))}
          />
        </footer>
      </Card>

      <DiscountDialog
        open={dialog === "discount"}
        onClose={() => setDialog(null)}
        products={selection}
        onDone={refresh}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        products={selection}
        onDone={refresh}
      />
    </div>
  );
}

/**
 * A product's stock badge, from its worst *size* — the same status the
 * stock filter and the "Needs attention" tile use. It used to be worked
 * out from the product's total units, so a product with 40 of one size
 * and none of another read "In stock" while the "Out of stock" filter
 * listed it. The total is still on the line beside the badge.
 */
function ProductStockBadge({ summary }) {
  const status = summary.lowestStatus ?? STOCK_STATUS.UNAVAILABLE;

  // "Out of stock" for the whole product only when nothing is left; a
  // product still selling other sizes is told apart.
  const label =
    status === STOCK_STATUS.OUT_OF_STOCK && summary.totalStock > 0
      ? "Size out of stock"
      : status === STOCK_STATUS.UNAVAILABLE && !summary.sizeCount
        ? "No sizes"
        : STOCK_LABEL[status];

  return <Badge tone={STOCK_TONE[status]}>{label}</Badge>;
}

function PageHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Products</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          The catalogue behind the storefront, live against the API. Every product belongs to
          exactly one category and carries its own price and offer.
        </p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <LinkButton variant="secondary" href="/admin/products/bulk" className="flex-1 sm:flex-none">
          Bulk upload
        </LinkButton>
        <LinkButton variant="primary" href="/admin/products/new" className="flex-1 sm:flex-none">
          Add product
        </LinkButton>
      </div>
    </div>
  );
}

function BulkBar({ count, onClear, onActivate, onDeactivate, onDiscount, onDelete }) {
  return (
    // Same strip as the inventory screen's selection bar, so bulk actions
    // look alike across the admin.
    <div className="sb-enter flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50/70 px-3 py-2">
      <span className="text-sm font-medium text-brand-800">
        {count} product{count === 1 ? "" : "s"} selected
      </span>
      <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <Button size="sm" variant="secondary" onClick={onDiscount}>
          <Percent className="size-3.5" aria-hidden="true" />
          Discount…
        </Button>
        <Button size="sm" variant="secondary" onClick={onActivate}>
          <Eye className="size-3.5" aria-hidden="true" />
          Activate
        </Button>
        <Button size="sm" variant="secondary" onClick={onDeactivate}>
          <EyeOff className="size-3.5" aria-hidden="true" />
          Deactivate
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete…
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

/** 1 … around the current page … last, collapsing long runs into ellipses. */
function pageNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const middle = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
  const out = [1];
  if (middle.length && middle[0] > 2) out.push("gap-start");
  out.push(...middle);
  if (middle.length && middle[middle.length - 1] < pages - 1) out.push("gap-end");
  out.push(pages);
  return out;
}

function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    // Wraps rather than overflowing: at its widest (first, gap, three around
    // the current page, gap, last) it is right at a phone footer's width.
    <nav aria-label="Product pages" className="flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </button>
      {pageNumbers(page, pages).map((n) =>
        typeof n === "string" ? (
          <span key={n} aria-hidden="true" className="px-1 text-ink-400">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            className={cx(
              "h-8 min-w-8 rounded-lg px-2 font-medium transition-colors",
              n === page ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            {n}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  );
}

function ViewToggleButton({ active, onClick, title, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={title}
      className={cx(
        "flex size-9 items-center justify-center rounded-md transition-colors sm:size-8",
        active ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
      )}
    >
      {icon}
    </button>
  );
}

/**
 * Storefront-style tile: image-led so products are recognisable at a glance.
 * The operational detail sits in a hover/focus overlay; the full record lives
 * one click away on the detail page or in list view.
 */
function ProductGridCard({ product, selected, busy, onToggleSelect, onToggleActive }) {
  return (
    <li
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-xl bg-white shadow-sm shadow-ink-900/[0.03] ring-1 transition-shadow",
        selected ? "ring-2 ring-brand-400" : "ring-ink-200/80 hover:shadow-md hover:shadow-ink-900/[0.08]",
      )}
    >
      <div className="relative aspect-[4/5]">
        <ProductCover
          product={product}
          size="100%"
          rounded="rounded-none"
          ring={false}
          className="absolute inset-0"
        />
        <span className="absolute left-2 top-2 z-10 flex rounded-md bg-white/90 p-1 shadow-sm">
          <Checkbox checked={selected} onChange={onToggleSelect} aria-label={`Select ${product.name}`} />
        </span>
        {product.discountPercentage > 0 ? (
          <Badge tone="brand" className="absolute right-2 top-2 shadow-sm">
            −{Number(product.discountPercentage)}%
          </Badge>
        ) : null}
        {product.isFeatured ? (
          <Badge tone="gold" className="absolute bottom-2 left-2 shadow-sm">
            Featured
          </Badge>
        ) : null}

        <div
          className={cx(
            "pointer-events-none absolute inset-0 flex flex-col justify-end gap-2 p-2.5 text-white",
            "bg-gradient-to-t from-ink-900/85 via-ink-900/40 to-ink-900/5",
            "opacity-0 transition-opacity duration-150",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            // A touch screen has no hover to reveal View/Edit with, and a tap
            // on the cover focuses nothing — so there the overlay simply stays.
            "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
          )}
        >
          <div className="space-y-0.5 text-[11px] leading-snug text-white/90">
            <p className="truncate font-mono">/{product.slug}</p>
            <p>
              {product.stock.sizeCount
                ? `${product.stock.sizeCount} sizes · ${number(product.stock.totalStock)} units`
                : "no sizes yet"}
            </p>
            <p>updated {relativeDate(product.updatedAt)}</p>
          </div>
          <div className="flex gap-1.5">
            <LinkButton size="sm" variant="primary" href={`/admin/products/${product.id}`} className="flex-1">
              View
            </LinkButton>
            <LinkButton
              size="sm"
              variant="secondary"
              href={`/admin/products/${product.id}/edit`}
              className="flex-1"
            >
              Edit
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <Link
          href={`/admin/products/${product.id}`}
          className="truncate text-[13px] font-medium text-ink-900 hover:text-brand-700 hover:underline"
        >
          {product.name}
        </Link>
        <p className="truncate text-[11px] text-ink-500">
          {product.categoryName}
          {product.categoryActive ? "" : " · category inactive"}
        </p>
        <PriceCell
          basePrice={product.basePrice}
          salePrice={product.currentPrice}
          discountPercent={product.discountPercentage}
          align="left"
        />
        <div className="mt-1">
          <ProductStockBadge summary={product.stock} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <ActiveDot active={product.active} />
          <Toggle
            checked={product.active}
            onChange={onToggleActive}
            disabled={busy}
            label={`Toggle ${product.name} on the storefront`}
            size="sm"
          />
        </div>
      </div>
    </li>
  );
}

/**
 * List view below `md`: the same fields and actions as <ProductRow>,
 * stacked into a card a phone can show without scrolling sideways.
 */
function ProductListCard({ product, selected, busy, onToggleSelect, onToggleActive }) {
  return (
    <li
      className={cx(
        "rounded-xl bg-white p-3 shadow-sm shadow-ink-900/[0.03] ring-1",
        selected ? "ring-2 ring-brand-400" : "ring-ink-200/80",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 items-center">
          <Checkbox checked={selected} onChange={onToggleSelect} aria-label={`Select ${product.name}`} />
        </span>
        <ProductCover product={product} size={40} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/products/${product.id}`}
            className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline"
          >
            {product.name}
          </Link>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-500">
            <span className="truncate font-mono">/{product.slug}</span>
            {product.isFeatured ? <Badge tone="gold">Featured</Badge> : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-500">
            {product.categoryName}
            {product.categoryActive ? "" : " · category inactive"}
          </p>
        </div>
        <PriceCell
          basePrice={product.basePrice}
          salePrice={product.currentPrice}
          discountPercent={product.discountPercentage}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-400">
        <ProductStockBadge summary={product.stock} />
        <span>
          {product.stock.sizeCount
            ? `${product.stock.sizeCount} sizes · ${number(product.stock.totalStock)} units`
            : "no sizes yet"}
        </span>
        <span>updated {relativeDate(product.updatedAt)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
        <Toggle
          checked={product.active}
          onChange={onToggleActive}
          disabled={busy}
          label={`Toggle ${product.name} on the storefront`}
          size="sm"
        />
        <ActiveDot active={product.active} />
        <div className="ml-auto flex items-center gap-1.5">
          <LinkButton size="sm" variant="ghost" href={`/admin/products/${product.id}`} className="h-9">
            View
          </LinkButton>
          <LinkButton
            size="sm"
            variant="secondary"
            href={`/admin/products/${product.id}/edit`}
            className="h-9"
          >
            Edit
          </LinkButton>
        </div>
      </div>
    </li>
  );
}

function ProductRow({ product, selected, busy, onToggleSelect, onToggleActive }) {
  return (
    <tr className={cx("align-middle transition-colors", selected ? "bg-brand-50/60" : "hover:bg-ink-50/70")}>
      <td className="px-3 py-2.5">
        <Checkbox checked={selected} onChange={onToggleSelect} aria-label={`Select ${product.name}`} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          <ProductCover product={product} size={40} />
          <div className="min-w-0">
            <Link
              href={`/admin/products/${product.id}`}
              className="block truncate font-medium text-ink-900 hover:text-brand-700 hover:underline"
            >
              {product.name}
            </Link>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
              <span className="truncate font-mono">/{product.slug}</span>
              {product.isFeatured ? <Badge tone="gold">Featured</Badge> : null}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-ink-700">{product.categoryName}</div>
        {product.categoryActive ? null : (
          <div className="text-[11px] text-ink-400">category inactive</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <PriceCell
          basePrice={product.basePrice}
          salePrice={product.currentPrice}
          discountPercent={product.discountPercentage}
        />
      </td>
      <td className="px-3 py-2.5">
        <ProductStockBadge summary={product.stock} />
        <div className="mt-1 text-[11px] text-ink-400">
          {product.stock.sizeCount
            ? `${product.stock.sizeCount} sizes · ${number(product.stock.totalStock)} units`
            : "no sizes yet"}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Toggle
            checked={product.active}
            onChange={onToggleActive}
            disabled={busy}
            label={`Toggle ${product.name} on the storefront`}
            size="sm"
          />
          <ActiveDot active={product.active} />
        </div>
        <div className="mt-0.5 text-[11px] text-ink-400">updated {relativeDate(product.updatedAt)}</div>
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <LinkButton size="sm" variant="ghost" href={`/admin/products/${product.id}`}>
          View
        </LinkButton>
        <LinkButton
          size="sm"
          variant="secondary"
          className="ml-1.5"
          href={`/admin/products/${product.id}/edit`}
        >
          Edit
        </LinkButton>
      </td>
    </tr>
  );
}
