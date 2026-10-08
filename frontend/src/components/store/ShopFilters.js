"use client";

/**
 * The shop's filter rail (F-06 Product Browsing).
 *
 * Every control here narrows the same browse state the grid beside it reads,
 * so nothing is fetched when a box is ticked — the whole catalogue is already
 * on the page and the filtering is a pass over an array.
 *
 * The counts are the point of the rail. Each one is computed with its own
 * dimension left out of the filter, which is what makes them true: "Size 40
 * (6)" means six pieces would remain *with everything else still applied*, so
 * a shopper can never tick an option that empties the grid. An option that
 * would return nothing is shown disabled rather than hidden — a size the shop
 * stocks but has sold out of in this collection is worth seeing.
 *
 * On small screens the same panel is a drawer. It is a Radix dialog for the
 * reasons the sign-in modal is one: Escape, the focus trap and the inert page
 * behind it all have to work, and this one is long enough to scroll.
 */

import { ListFilter, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMemo, useState } from "react";

import { applyRail, filterProducts, priceBands, RATING_STEPS } from "@/lib/store/filters";
import { cn } from "@/lib/utils";
import { useBrowse } from "./BrowseProvider";
import { Stars } from "./Stars";

export function ShopFilters({ products, categories, fabrics, fits, sizes }) {
  const { filters, tab, activeCount, clearFilters } = useBrowse();
  const [open, setOpen] = useState(false);

  // What the grid is showing right now — the drawer's "done" button says so,
  // because on a phone the results are behind the panel and cannot be seen.
  const shown = useMemo(
    () => applyRail(filterProducts(products, filters), tab).length,
    [products, filters, tab],
  );

  const panelProps = { products, categories, fabrics, fits, sizes };

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger className="flex w-full items-center justify-center gap-2 rounded-full border border-sb-heading px-5 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/50 lg:hidden">
          <ListFilter className="size-4" aria-hidden="true" />
          Filters
          {activeCount ? (
            <span className="rounded-full bg-sb-heading px-2 py-0.5 text-xs text-sb-bg tabular">
              {activeCount}
            </span>
          ) : null}
        </DialogPrimitive.Trigger>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-sb-footer/50 backdrop-blur-[2px] lg:hidden" />
          <DialogPrimitive.Content
            // The panel is its own description — a paragraph above a list of
            // checkboxes would only be read out on the way past them. Radix
            // warns unless the omission is explicit.
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex w-[88%] max-w-sm flex-col bg-sb-bg font-body shadow-2xl shadow-sb-footer/25 lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-sb-gold/30 px-5 py-4">
              <DialogPrimitive.Title className="font-display text-xl font-semibold text-sb-heading">
                Filters
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Close filters"
                className="rounded-full p-2 text-sb-text-muted transition-colors hover:bg-sb-surface/70 hover:text-sb-heading"
              >
                <X className="size-4" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            {/* The panel is long on a phone, so it scrolls between a pinned
                header and a pinned action rather than pushing them away. */}
            <div className="sb-no-scrollbar flex-1 overflow-y-auto px-5 py-4">
              <FilterPanel scope="drawer" {...panelProps} />
            </div>

            <div className="flex items-center gap-3 border-t border-sb-gold/30 px-5 py-4">
              {activeCount ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="shrink-0 text-sm font-semibold text-sb-link underline underline-offset-4"
                >
                  Clear all
                </button>
              ) : null}
              <DialogPrimitive.Close className="flex-1 rounded-full bg-sb-btn-primary px-5 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose">
                Show {shown} {shown === 1 ? "piece" : "pieces"}
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/*
        The <aside> is the sticky element itself, not a wrapper around one.
        That is the whole trick: a sticky box can only travel inside its own
        containing block, and an aside sized to its content is exactly as tall
        as the rail — no room to move, so it scrolls away with the page and
        leaves an empty column beside the rest of the grid. Sticking the flex
        item makes the containing block the row, which is as tall as the grid.
        `lg:self-start` then keeps it from stretching, which would defeat it
        again. This is the same shape the bag and checkout summaries use.

        `top-44` down to `wide:top-28` is the storefront's standard header
        offset: below `wide` the header's search field drops to a second row
        and takes the extra height with it.
      */}
      <aside className="hidden w-60 shrink-0 lg:sticky lg:top-44 lg:block lg:self-start xl:w-64 wide:top-28">
        {/* Scrollable in its own right — the rail outgrows a laptop viewport
            once the shop carries more than a handful of fabrics — but with no
            scrollbar drawn, so a rail that just overflows does not sprout a
            gutter beside the checkboxes. */}
        <div className="sb-no-scrollbar max-h-[calc(100dvh-12rem)] overflow-y-auto wide:max-h-[calc(100dvh-8rem)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-sb-heading">Filters</h2>
            {activeCount ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="mt-4">
            <FilterPanel scope="rail" {...panelProps} />
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * The controls themselves, rendered twice — once in the rail, once in the
 * drawer. `scope` keeps the two copies' radio groups apart: two groups
 * sharing a `name` in one document are one group to the browser, and picking
 * a collection in the drawer would reach into the rail behind it.
 */
function FilterPanel({ scope, products, categories, fabrics, fits, sizes }) {
  const {
    filters,
    tab,
    categoryId,
    setCategoryId,
    fabrics: chosenFabrics,
    toggleFabric,
    fits: chosenFits,
    toggleFit,
    sizes: chosenSizes,
    toggleSize,
    price,
    setPrice,
    inStockOnly,
    setInStockOnly,
    minRating,
    setMinRating,
  } = useBrowse();

  const bands = useMemo(() => priceBands(products), [products]);
  // No reviews anywhere means no rating section. A filter whose every option
  // reads (0) is a broken control, not an empty one.
  const anyRated = useMemo(() => products.some((p) => p.rating?.count > 0), [products]);

  const counts = useMemo(() => {
    // The rail's own tab still applies: "On Offer" is a filter as much as a
    // sort, and a count that ignored it would promise discounted pieces that
    // are not.
    const without = (dimension) =>
      applyRail(filterProducts(products, filters, { except: dimension }), tab);
    const tally = (rows, choice) => filterProducts(rows, choice).length;

    const forCategory = without("category");
    const forFabric = without("fabric");
    const forFit = without("fit");
    const forSize = without("size");
    const forPrice = without("price");
    const forRating = without("rating");

    return {
      anyCategory: forCategory.length,
      category: new Map(categories.map((c) => [c.id, tally(forCategory, { categoryId: c.id })])),
      fabric: new Map(fabrics.map((f) => [f.name, tally(forFabric, { fabrics: [f.name] })])),
      fit: new Map(fits.map((f) => [f.name, tally(forFit, { fits: [f.name] })])),
      size: new Map(sizes.map((size) => [size, tally(forSize, { sizes: [size] })])),
      anyPrice: forPrice.length,
      price: new Map(bands.map((band) => [band.id, tally(forPrice, { price: band })])),
      anyRating: forRating.length,
      rating: new Map(RATING_STEPS.map((step) => [step, tally(forRating, { minRating: step })])),
      inStock: tally(without("stock"), { inStockOnly: true }),
    };
  }, [products, filters, tab, categories, fabrics, fits, sizes, bands]);

  return (
    <div className="text-sm">
      <Section title="Collection">
        <Choice
          type="radio"
          name={`${scope}-category`}
          label="All collections"
          count={counts.anyCategory}
          checked={categoryId === "all"}
          onChange={() => setCategoryId("all")}
        />
        {categories.map((category) => (
          <Choice
            key={category.id}
            type="radio"
            name={`${scope}-category`}
            label={category.name}
            count={counts.category.get(category.id) ?? 0}
            checked={categoryId === category.id}
            onChange={() => setCategoryId(category.id)}
          />
        ))}
      </Section>

      {fabrics.length ? (
        <Section title="Fabric & print">
          {fabrics.map((item) => (
            <Choice
              key={item.name}
              type="checkbox"
              name={`${scope}-fabric`}
              label={item.name}
              count={counts.fabric.get(item.name) ?? 0}
              checked={chosenFabrics.includes(item.name)}
              onChange={() => toggleFabric(item.name)}
            />
          ))}
        </Section>
      ) : null}

      {/* Only once the shop has recorded a fit against something. Fit is new
          and most of the catalogue predates it, so this section appears as
          the pieces are measured rather than sitting there empty — and it
          lists the cuts actually on the shelf, never one the shop merely
          publishes a chart for. */}
      {fits.length ? (
        <Section title="Fit">
          {fits.map((item) => (
            <Choice
              key={item.name}
              type="checkbox"
              name={`${scope}-fit`}
              label={item.name}
              count={counts.fit.get(item.name) ?? 0}
              checked={chosenFits.includes(item.name)}
              onChange={() => toggleFit(item.name)}
            />
          ))}
        </Section>
      ) : null}

      {sizes.length ? (
        <Section title="Size">
          {/* Chips rather than a list: the labels are two characters wide and
              a column of them would run the rail down the page. */}
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => {
              const count = counts.size.get(size) ?? 0;
              const chosen = chosenSizes.includes(size);

              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  disabled={!count && !chosen}
                  aria-pressed={chosen}
                  aria-label={`Size ${size}, ${count} ${count === 1 ? "piece" : "pieces"}`}
                  className={cn(
                    "min-w-10 rounded-lg border px-2 py-1.5 text-[13px] font-semibold transition-colors",
                    chosen
                      ? "border-sb-heading bg-sb-heading text-sb-bg"
                      : "border-sb-gold/45 bg-sb-bg text-sb-text hover:border-sb-heading",
                    !count && !chosen && "cursor-not-allowed opacity-40 hover:border-sb-gold/45",
                  )}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

      {bands.length ? (
        <Section title="Price">
          <Choice
            type="radio"
            name={`${scope}-price`}
            label="Any price"
            count={counts.anyPrice}
            checked={price === null}
            onChange={() => setPrice(null)}
          />
          {bands.map((band) => (
            <Choice
              key={band.id}
              type="radio"
              name={`${scope}-price`}
              label={band.label}
              count={counts.price.get(band.id) ?? 0}
              checked={price?.id === band.id}
              onChange={() => setPrice(band)}
            />
          ))}
        </Section>
      ) : null}

      {anyRated ? (
        <Section title="Customer rating">
          <Choice
            type="radio"
            name={`${scope}-rating`}
            label="Any rating"
            count={counts.anyRating}
            checked={minRating === 0}
            onChange={() => setMinRating(0)}
          />
          {RATING_STEPS.map((step) => (
            <Choice
              key={step}
              type="radio"
              name={`${scope}-rating`}
              label={
                <span className="flex items-center gap-1.5">
                  <Stars rating={step} size="size-3.5" />
                  <span className="text-sb-text-muted">&amp; up</span>
                </span>
              }
              srLabel={`${step} stars and up`}
              count={counts.rating.get(step) ?? 0}
              checked={minRating === step}
              onChange={() => setMinRating(step)}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Availability">
        <Choice
          type="checkbox"
          name={`${scope}-stock`}
          label="In stock only"
          count={counts.inStock}
          checked={inStockOnly}
          onChange={() => setInStockOnly(!inStockOnly)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="border-t border-sb-gold/25 py-4 first:border-t-0 first:pt-0">
      <h3 className="sb-eyebrow text-[10px] text-sb-gold-text">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/**
 * One radio or checkbox with the count it would leave behind.
 *
 * A real input rather than a styled button: these are the two controls a
 * screen reader and a keyboard already know, and a filter rail is exactly
 * where that matters. `srLabel` is for the rating rows, whose visible label
 * is a row of stars.
 */
function Choice({ type, name, label, srLabel, count, checked, onChange }) {
  // Never disable something already ticked — the shopper has to be able to
  // untick their way back out of a filter that now returns nothing.
  const disabled = !count && !checked;

  // The count is half the information in a facet — how many pieces are behind
  // it is exactly what decides whether it is worth ticking — so it is spoken
  // as part of the control's name rather than left as decoration beside it.
  const spoken = srLabel ?? (typeof label === "string" ? label : null);

  return (
    <label
      className={cn(
        "flex items-center gap-2.5 py-1.5",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={spoken ? `${spoken}, ${count} ${count === 1 ? "piece" : "pieces"}` : undefined}
        className="size-4 shrink-0 accent-sb-heading"
      />
      <span className="min-w-0 flex-1 text-sb-text">{label}</span>
      <span className="shrink-0 text-xs text-sb-text-muted tabular" aria-hidden="true">
        {count}
      </span>
    </label>
  );
}
