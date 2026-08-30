/**
 * What a browse filter means (F-06 Product Browsing & Search).
 *
 * One module, because the same question is now asked from two places that
 * must agree: the grid asks "which pieces do I draw?", and the sidebar asks
 * "how many pieces would be left if you also picked this?". A second copy of
 * the rules would drift, and the way it would show is the worst way — a
 * facet reading "Chanderi silk 4" that opens on three cards.
 *
 * Every dimension here is backed by a field the catalogue actually carries:
 * category and price come off the row, `fabric` is derived from the piece's
 * name, and `available_sizes` is the sizes with stock behind them. There is
 * no colour filter and no occasion filter, because the shop records neither
 * — a control that cannot answer honestly is worse than an absent one.
 *
 * Pure functions over plain objects, no directive: this compiles into
 * whichever bundle imports it.
 */

import { money } from "@/lib/format";

// --- the tabs ---------------------------------------------------------------

/**
 * Every tab sorts on something the catalogue actually records. There is no
 * "bestsellers" rail: the live shop publishes no sales figures, so ranking by
 * popularity would be invented.
 *
 * These live beside the filters rather than beside the browse state because
 * the ids and the rails below are one vocabulary — a tab whose id no rail
 * answers to silently falls back to "New In".
 */
export const TABS = [
  { id: "new", label: "New In" },
  { id: "offers", label: "On Offer" },
  { id: "lowest", label: "Lowest Price" },
  { id: "almost-gone", label: "Almost Gone" },
];

/** Sort orders behind the four tabs. Filtering happens before any of them. */
const RAILS = {
  new: (rows) => [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  offers: (rows) => rows.filter((p) => p.off > 0).sort((a, b) => b.off - a.off),
  lowest: (rows) => [...rows].sort((a, b) => a.price - b.price),
  "almost-gone": (rows) =>
    rows.filter((p) => p.in_stock && p.is_low_stock).sort((a, b) => a.stock - b.stock),
};

export function applyRail(rows, tab) {
  return (RAILS[tab] || RAILS.new)(rows);
}

// --- the filter -------------------------------------------------------------

/**
 * An unfiltered browse. Also the shape of the filter everywhere else: the
 * provider spreads it, `clearFilters` returns to it, and arriving on `/shop`
 * resets to it before the query string is read.
 */
export const NO_FILTERS = {
  categoryId: "all",
  fabrics: [],
  sizes: [],
  /** The chosen band object from `priceBands`, or null for any price. */
  price: null,
  inStockOnly: false,
  /** 0 for any, otherwise the lowest average a piece may have and still show. */
  minRating: 0,
  query: "",
};

/**
 * One test per dimension, keyed by the name a facet count excludes itself by.
 *
 * Multi-value dimensions are OR within themselves and AND across each other,
 * which is what a shopper means by ticking "38" and "40": pieces available in
 * either size, not pieces available in both.
 */
const MATCHES = {
  category: (product, f) => f.categoryId === "all" || product.category_id === f.categoryId,

  fabric: (product, f) => !f.fabrics.length || f.fabrics.includes(product.fabric),

  // Against `available_sizes`, not `sizes`: filtering by 40 means "show me
  // what I can buy in a 40", and a piece whose 40 sold out cannot be.
  size: (product, f) => !f.sizes.length || product.available_sizes.some((s) => f.sizes.includes(s)),

  price: (product, f) => !f.price || inBand(product.price, f.price),

  stock: (product, f) => !f.inStockOnly || product.in_stock,

  // A piece with no reviews is not a zero-star piece — it is unrated, and it
  // drops out of a rating filter rather than failing it.
  rating: (product, f) =>
    !f.minRating || (product.rating?.count > 0 && product.rating.average >= f.minRating),

  query: (product, f) => {
    const term = f.query.trim().toLowerCase();
    if (!term) return true;

    return [product.name, product.category_name, product.fabric, ...product.available_sizes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(term);
  },
};

/**
 * The catalogue narrowed to one filter.
 *
 * `except` drops a single dimension from the test, which is how the sidebar
 * counts its own options: the number beside "Anarkali salwars" is how many
 * pieces that collection would show *given everything else already picked*,
 * so it is never a count of a grid the shopper cannot get to.
 */
export function filterProducts(products, filters, { except } = {}) {
  const full = { ...NO_FILTERS, ...filters };
  const tests = Object.entries(MATCHES)
    .filter(([dimension]) => dimension !== except)
    .map(([, test]) => test);

  return products.filter((product) => tests.every((test) => test(product, full)));
}

/** How many separate choices are active — the number on the mobile button. */
export function countActive(filters) {
  const f = { ...NO_FILTERS, ...filters };

  return (
    (f.categoryId !== "all" ? 1 : 0) +
    f.fabrics.length +
    f.sizes.length +
    (f.price ? 1 : 0) +
    (f.inStockOnly ? 1 : 0) +
    (f.minRating ? 1 : 0) +
    (f.query.trim() ? 1 : 0)
  );
}

// --- price bands ------------------------------------------------------------

/** Upper edges are exclusive, and a null one means the band is open-ended. */
function inBand(price, band) {
  return price >= band.min && (band.max === null || price < band.max);
}

// Round steps a price tag is actually written in. The first one that splits
// the shop into four bands or fewer wins.
const STEPS = [250, 500, 1000, 2000, 2500, 5000, 10_000];

/**
 * Price bands derived from what the shop charges, not from a fixed ladder.
 *
 * A hard-coded "under ₹500 / ₹500–1000 / …" would half-empty itself the day
 * the catalogue moved upmarket; these are cut from the real low and high, so
 * every band shown has a chance of containing something. Fewer than two bands
 * means the shelf is too flat to be worth filtering and the section is
 * dropped entirely.
 */
export function priceBands(products) {
  const prices = products.map((p) => p.price).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length < 2) return [];

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (high === low) return [];

  const step = STEPS.find((size) => (high - low) / size <= 4) ?? STEPS[STEPS.length - 1];
  const bands = [];

  for (let edge = Math.floor(low / step) * step; edge <= high; edge += step) {
    // The top band is left open rather than closed at the most expensive
    // piece: it stays true when a dearer one is added mid-session.
    const max = edge + step > high ? null : edge + step;

    bands.push({
      id: String(edge),
      min: edge,
      max,
      label:
        bands.length === 0 && max !== null
          ? `Under ${money(max)}`
          : max === null
            ? `${money(edge)} & above`
            : `${money(edge)} – ${money(max - 1)}`,
    });
  }

  return bands.length > 1 ? bands : [];
}

// --- ratings ----------------------------------------------------------------

/**
 * Only the two steps worth offering. "1 star & up" is every rated piece in
 * the shop and "5 stars" alone is a filter that mostly returns nothing.
 */
export const RATING_STEPS = [4, 3];
