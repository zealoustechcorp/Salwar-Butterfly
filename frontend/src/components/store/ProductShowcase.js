"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { applyRail, filterProducts, TABS } from "@/lib/store/filters";
import { cn } from "@/lib/utils";
import { useBrowse } from "./BrowseProvider";
import { ProductCard } from "./ProductCard";

// 12 divides evenly by the 2-, 3- and 4-column grids, so no breakpoint ends on
// a ragged row.
const PAGE = 12;

const BLURB = {
  new: "The most recently added pieces, newest first.",
  offers: "Everything currently below its original price.",
  lowest: "The whole shelf, cheapest first.",
  "almost-gone": "Only a few of each left — these runs are ending.",
};

/**
 * The grid, its tabs and its search box.
 *
 * Rendered in two places and they are not quite the same shape. On the home
 * page it is a full-width section that owns its own margins; on `/shop` it
 * sits in the right-hand column beside <ShopFilters>, where the page owns the
 * margins and a fourth column would squeeze the cards. `withSidebar` is that
 * difference and nothing else — the filtering underneath is identical, and it
 * is the same filtering the rail counts with.
 */
export function ProductShowcase({ products, categories, withSidebar = false }) {
  const { tab, setTab, filters, setQuery, clearFilters } = useBrowse();
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(
    () => applyRail(filterProducts(products, filters), tab),
    [products, filters, tab],
  );

  const activeCategory = categories.find((c) => c.id === filters.categoryId);

  const chooseTab = (id) => {
    setTab(id);
    setShown(PAGE);
  };

  return (
    <section
      id="shop"
      className={cn(
        "scroll-mt-40 wide:scroll-mt-28",
        withSidebar ? "" : "mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="sb-eyebrow text-[10px] text-sb-gold-text">The Shop</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            {activeCategory ? activeCategory.name : "Everything in store"}
          </h2>
          <p className="mt-2 text-sm text-sb-text-muted">{BLURB[tab]}</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sb-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE);
            }}
            placeholder="Search by name, fabric or size"
            aria-label="Search this collection"
            className="h-11 w-full rounded-full border border-sb-gold/40 bg-white/70 pr-4 pl-9 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="sb-no-scrollbar mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => chooseTab(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors sm:px-5 sm:py-2.5",
              tab === item.id
                ? "border-sb-heading bg-sb-heading text-sb-bg"
                : "border-sb-gold/45 bg-sb-bg text-sb-text hover:border-sb-heading",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ActiveFilters
        activeCategory={activeCategory}
        onAnyChange={() => setShown(PAGE)}
      />

      <p className="mt-4 text-xs text-sb-text-muted tabular">
        {rows.length} {rows.length === 1 ? "piece" : "pieces"}
      </p>

      {rows.length ? (
        <>
          <div
            className={cn(
              "mt-4 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:gap-x-6",
              // Beside the rail there is a column's worth less room, so the
              // fourth card waits for a wider screen rather than being ground
              // down to a thumbnail.
              withSidebar ? "xl:grid-cols-4" : "lg:grid-cols-4",
            )}
          >
            {rows.slice(0, shown).map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>

          {shown < rows.length ? (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setShown((count) => count + PAGE)}
                className="rounded-full border border-sb-heading px-7 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
              >
                Show {Math.min(PAGE, rows.length - shown)} more
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-sb-gold/50 bg-sb-surface/25 px-6 py-12 text-center">
          <p className="font-display text-2xl font-semibold text-sb-heading">Nothing matches that yet</p>
          <p className="mt-2 text-sm text-sb-text-muted">
            Try a different fabric or clear the filters to see the whole shop.
          </p>
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setShown(PAGE);
            }}
            className="mt-5 rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg hover:bg-sb-btn-rose"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Everything currently narrowing the grid, each removable on its own.
 *
 * This is not a duplicate of the rail. It is the only way back out of a filter
 * on the home page, which has no rail at all, and on `/shop` it is what a
 * shopper who has scrolled past the top of the rail can still see and undo.
 */
function ActiveFilters({ activeCategory, onAnyChange }) {
  const {
    isFiltered,
    setCategoryId,
    fabrics,
    toggleFabric,
    sizes,
    toggleSize,
    price,
    setPrice,
    inStockOnly,
    setInStockOnly,
    minRating,
    setMinRating,
    query,
    setQuery,
    clearFilters,
  } = useBrowse();

  if (!isFiltered) return null;

  const drop = (action) => () => {
    action();
    onAnyChange();
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <SlidersHorizontal className="size-4 text-sb-text-muted" aria-hidden="true" />

      {activeCategory ? (
        <FilterPill label={activeCategory.name} onClear={drop(() => setCategoryId("all"))} />
      ) : null}

      {fabrics.map((name) => (
        <FilterPill key={name} label={name} onClear={drop(() => toggleFabric(name))} />
      ))}

      {sizes.map((size) => (
        <FilterPill key={size} label={`Size ${size}`} onClear={drop(() => toggleSize(size))} />
      ))}

      {price ? <FilterPill label={price.label} onClear={drop(() => setPrice(null))} /> : null}

      {minRating ? (
        <FilterPill label={`${minRating}★ & up`} onClear={drop(() => setMinRating(0))} />
      ) : null}

      {inStockOnly ? (
        <FilterPill label="In stock only" onClear={drop(() => setInStockOnly(false))} />
      ) : null}

      {query.trim() ? (
        <FilterPill label={`“${query.trim()}”`} onClear={drop(() => setQuery(""))} />
      ) : null}

      <button
        type="button"
        onClick={drop(clearFilters)}
        className="ml-1 text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
      >
        Clear all
      </button>
    </div>
  );
}

function FilterPill({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sb-surface px-3 py-1.5 text-xs font-semibold text-sb-text">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label} filter`}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
