/**
 * Storefront read model (F-06 Product Browsing) — the customer's view of the
 * live Salwar Butterfly catalogue.
 *
 * This module used to import a committed JSON snapshot. It now reads
 * `GET /storefront/getCatalogue` from the API, which is the same data
 * from the same database — the export script's SQL moved into
 * storefront.repository.js — except that it is true at the moment it is
 * read rather than at the moment somebody last remembered to run an
 * export. A sold-out size now reads as sold out.
 *
 * What did *not* change is everything below the fetch. `decorate`,
 * `getRelatedProducts`, `getFabrics` and the rest are the same pure
 * functions over the same shapes, and every component that consumes them
 * is untouched. That is why the API serves this snake_case read model
 * rather than the admin API's camelCase: the storefront's vocabulary —
 * `in_stock`, `piece_code`, `available_sizes` — is mostly derived here
 * and has no column behind it, and renaming the four fields that do come
 * from the database would have left every product object speaking two
 * conventions at once. The reasoning is repeated at the other end, in
 * backend/src/mapper/storefront.mapper.js.
 *
 * Every exported query is now async. They are called from server
 * components only, so that costs an `await` at seven call sites and
 * nothing else.
 *
 * Ids are UUIDs. They are opaque strings — never parse or compare them
 * numerically. Every size carries a `variant_id`: that is what a bag
 * line is ordered against, because a size label alone identifies nothing
 * the API can sell.
 */

import { cache } from "react";

import { STOCK_STATUS, stockStatusFor } from "@/lib/stock";

import { SHOP } from "./shop";

// --- the read -----------------------------------------------------------

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long a rendered page may go on showing the catalogue it was built
 * with, in seconds.
 *
 * A minute is chosen against what actually goes stale. Prices and new
 * arrivals can wait; per-size stock is the field that matters, and it is
 * not what protects the shop from overselling — checkout re-reads stock
 * inside a locked transaction and refuses the line if it has gone. So
 * this window decides how quickly a sold-out size stops being *offered*,
 * not whether it can be sold twice. Sixty seconds of that, in exchange
 * for pages that serve from cache, is the right trade for a shop of this
 * size.
 */
const REVALIDATE_SECONDS = 60;

const EMPTY = {
  fetched_at: null,
  categories: [],
  products: [],
  // F-06.08. `average: null` rather than 0 — see the mapper at the other
  // end: zero is a rating, and the hero must be able to tell "nobody has
  // reviewed us" from "everybody hated it".
  rating: { count: 0, products: 0, average: null },
};

/**
 * The catalogue, fetched once per render and cached across requests.
 *
 * Two layers of caching, doing different jobs. `cache()` dedupes within
 * a single render — the layout, the page and its sections all ask for
 * the catalogue and one request is made. Next's `revalidate` is what
 * spans requests, so the second visitor in a minute costs the API
 * nothing.
 *
 * A failure throws rather than degrading to an empty shop. An empty grid
 * renders as "we sell nothing" with a 200 beside it, which is worse than
 * an error in every way that matters: a shopper cannot tell it from the
 * truth, and neither can a crawler. Throwing keeps the last good
 * statically-rendered page in front of people while the API is down,
 * which is exactly what stale-while-revalidate is for.
 */
const loadCatalogue = cache(async () => {
  const response = await fetch(`${API_BASE}/storefront/getCatalogue`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ["catalogue"] },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load the catalogue: the API answered ${response.status}. ` +
        `Check that the backend is running at ${API_BASE}.`,
    );
  }

  const payload = await response.json();

  return payload?.data ?? EMPTY;
});

// --- presentation lookups ---------------------------------------------------

/**
 * One-line merchandising copy per live category.
 *
 * Keyed by name, not id. The ids are UUIDs and would change if the
 * catalogue were ever re-imported into a fresh database; the names are the
 * shop's own and do not.
 */
const CATEGORY_BLURB = {
  "Straight cut salwars": "The everyday straight cut — dhabu, azrak and south cotton",
  "Coord sets": "Matching top-and-pant co-ords, ready to wear together",
  "Aline salwars": "A-line flare that skims rather than clings",
  "Anarkali salwars": "Heavy-flare anarkalis for weddings and festivals",
  "Western wears": "Smart tops, maxis and pants for the off-duty week",
};

/**
 * Fabric and print chips, matched against the product name — the shop encodes
 * them there ("Premium dhabu cotton salwar", "Kalamkari Cotton salwar") rather
 * than in a separate field. Order matters: the first match wins, so the more
 * specific terms are listed before plain cotton.
 */
const FABRIC_RULES = [
  { name: "Dhabu cotton", test: /dhab/i },
  { name: "Azrak", test: /azrak/i },
  { name: "Chanderi silk", test: /chanderi|silk/i },
  { name: "Kalamkari", test: /kalamkari/i },
  { name: "Kanchi cotton", test: /kanchi/i },
  { name: "South cotton", test: /south/i },
  { name: "Ikkat", test: /ikkat/i },
  { name: "Floral", test: /floral/i },
  { name: "Embroidery", test: /embroider/i },
  { name: "Cotton", test: /cotton/i },
];

export function fabricOf(name) {
  return FABRIC_RULES.find((rule) => rule.test.test(name))?.name || null;
}

// When a piece counts as running low is F-04's rule, not this file's —
// it comes from lib/stock.js, which mirrors the API's policy module, so
// the "only N left" notice here and the amber badge in the admin panel
// move together instead of drifting apart.

// --- decoration -------------------------------------------------------------

function decorate(product, categoryName) {
  const sizes = product.sizes.filter((s) => s.stock > 0);
  const inStock = product.stock > 0 && sizes.length > 0;

  return {
    ...product,
    category_name: categoryName,
    fabric: fabricOf(product.name),
    // How the piece is cut, recorded by the shop in the product's
    // attributes and carried by the public reader. It names one of the
    // published size charts, and that is all it is used for: the chart
    // dialog prints that table alone. Null where the shop has not said,
    // which shows every chart — see components/store/SizeChart.js.
    //
    // Unlike `fabric` above, nothing here guesses it from the name. A
    // fit read off a product title would be a measurement chart chosen
    // by a regular expression.
    fit: product.fit ?? null,
    saving: product.mrp ? product.mrp - product.price : 0,
    // Something a shopper can read out over the phone. The id is a UUID and
    // unusable for that; the first block is short, stable and distinct enough
    // across a catalogue this size.
    piece_code: `SB-${String(product.id).slice(0, 8).toUpperCase()}`,
    // Every size, each carrying the variant_id a bag line is ordered against.
    sizes: product.sizes,
    // Only sizes actually on the shelf are selectable.
    available_sizes: sizes.map((s) => s.size),
    // F-06.08. Defaulted rather than assumed: an API that predates the
    // reviews table returns no `rating`, and a card reaching into
    // `undefined.count` would take the whole grid down over a section
    // that is meant to be optional.
    rating: product.rating ?? { count: 0, average: null },
    in_stock: inStock,
    is_low_stock: inStock && stockStatusFor(product.stock) === STOCK_STATUS.LOW_STOCK,
  };
}

/** Shared by every query below: decorate the whole catalogue, newest first. */
function decorateAll({ categories, products }) {
  const names = new Map(categories.map((c) => [c.id, c.name]));

  return products
    .map((p) => decorate(p, names.get(p.category_id) || "—"))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// --- queries ----------------------------------------------------------------

/**
 * The shop's own name, contacts, banners and trust badges.
 *
 * Still synchronous, and still a constant — this is the one part of the
 * storefront that has no database behind it. See shop.js.
 */
export function getShop() {
  return SHOP;
}

/** When the catalogue in this render was read out of the database. */
export async function getFetchedAt() {
  return (await loadCatalogue()).fetched_at;
}

/** Everything a shopper can see, newest first. */
export async function getStorefrontProducts() {
  return decorateAll(await loadCatalogue());
}

/**
 * One product, decorated exactly as the grid's cards are.
 *
 * Ids come out of a URL segment and are matched as opaque strings — an id
 * that is not in the catalogue is a miss rather than a crash, and the route
 * turns that into a 404.
 */
export async function getStorefrontProduct(id) {
  const productId = String(id ?? "");
  if (!productId) return null;

  const { categories, products } = await loadCatalogue();

  const row = products.find((p) => p.id === productId);
  if (!row) return null;

  const names = new Map(categories.map((c) => [c.id, c.name]));
  return decorate(row, names.get(row.category_id) || "—");
}

/** Every product id, as route segments — what the detail route prerenders. */
export async function getProductIds() {
  const { products } = await loadCatalogue();
  return products.map((p) => String(p.id));
}

/**
 * What to show under a product.
 *
 * The rest of its own collection comes first, nearest in price — the shopper
 * who opened a ₹1,850 anarkali is looking at anarkalis around ₹1,850. If the
 * collection is too thin to fill the row, it is topped up with the same fabric
 * from elsewhere in the shop rather than padded with whatever is newest.
 *
 * Sold-out pieces sink to the bottom; they are not hidden, because a run
 * ending is worth seeing, but they never displace something buyable.
 */
export async function getRelatedProducts(product, limit = 4) {
  if (!product) return [];

  const all = (await getStorefrontProducts()).filter((p) => p.id !== product.id);
  const rank = (p) => (p.in_stock ? 0 : 1);

  const sameCategory = all
    .filter((p) => p.category_id === product.category_id)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Math.abs(a.price - product.price) - Math.abs(b.price - product.price),
    );

  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);

  const sameFabric = product.fabric
    ? all.filter(
        (p) => p.fabric === product.fabric && p.category_id !== product.category_id,
      )
    : [];

  return [...sameCategory, ...sameFabric.sort((a, b) => rank(a) - rank(b))].slice(0, limit);
}

/**
 * Active categories with the counts and entry price the tiles show.
 *
 * Takes the decorated products where the caller already has them, so a
 * page that renders both a grid and its category tiles decorates the
 * catalogue once rather than twice.
 */
export async function getStorefrontCategories(products) {
  const { categories } = await loadCatalogue();
  const rows = products ?? (await getStorefrontProducts());

  return categories.map((category) => {
    const mine = rows.filter((p) => p.category_id === category.id);

    return {
      ...category,
      blurb: CATEGORY_BLURB[category.name] || "",
      from_price: mine.length ? Math.min(...mine.map((p) => p.price)) : null,
      // Fall back to a product photo if the category has no cover image.
      image: category.image || mine[0]?.image || null,
    };
  });
}

/** Distinct fabrics across the catalogue — the "shop by fabric" chips. */
export async function getFabrics(products) {
  const rows = products ?? (await getStorefrontProducts());

  const counts = new Map();

  for (const p of rows) {
    if (p.fabric) counts.set(p.fabric, (counts.get(p.fabric) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * The cuts the shop actually sells in — `/shop`'s fit filter.
 *
 * Read off the products rather than off the published size charts, which is
 * the difference that matters: the shop may publish a chart for a fit it is
 * not currently cutting anything in, and a facet reading "Slim Fit (0)" is a
 * control that can only disappoint. Names arrive already spelled the way the
 * charts spell them — the API resolves a product's fit against `size_charts`
 * on every write — so they are grouped as they come rather than normalised
 * here, which would let "Normal" and "Normal Fit" become two chips.
 */
export async function getFits(products) {
  const rows = products ?? (await getStorefrontProducts());

  const counts = new Map();

  for (const p of rows) {
    if (p.fit) counts.set(p.fit, (counts.get(p.fit) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The size ladder the shop actually stocks — `/shop`'s size filter.
 *
 * Built from `available_sizes`, so a size that exists only on sold-out
 * variants never appears: every size offered here has at least one piece
 * behind it. Sizes are free text in the database (`product_variants.size`),
 * which is why they are ordered here rather than trusted to arrive sorted.
 */
export async function getSizes(products) {
  const rows = products ?? (await getStorefrontProducts());
  const seen = new Set();

  for (const p of rows) {
    for (const size of p.available_sizes) seen.add(size);
  }

  return [...seen].sort(compareSizes);
}

// Numeric sizes first, in numeric order — "6" before "38", which a string
// sort gets backwards. Lettered sizes follow in rack order, and anything the
// shop invents that is neither falls to the end alphabetically rather than
// being dropped.
const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];

// This catalogue writes the big sizes both ways — "2XL" on some variants and
// "XXL" on others — and they are one size on the rack, so they rank as one
// here rather than sorting into two separate clumps.
const canonicalSize = (size) =>
  size.toUpperCase().replace(/^(\d+)X/, (_, count) => "X".repeat(Number(count)));

function compareSizes(a, b) {
  const numberA = /^\d+$/.test(a) ? Number(a) : null;
  const numberB = /^\d+$/.test(b) ? Number(b) : null;

  if (numberA !== null && numberB !== null) return numberA - numberB;
  if (numberA !== null) return -1;
  if (numberB !== null) return 1;

  const rankA = LETTER_SIZES.indexOf(canonicalSize(a));
  const rankB = LETTER_SIZES.indexOf(canonicalSize(b));

  if (rankA !== -1 && rankB !== -1) return rankA - rankB;
  if (rankA !== -1) return -1;
  if (rankB !== -1) return 1;

  return a.localeCompare(b);
}

/**
 * Everything the home page renders, computed once on the server.
 *
 * The whole catalogue ships with it: the shop section filters and re-sorts
 * client-side, so browsing by category, fabric or search term is instant and
 * needs no request.
 */
export async function getHomePageData() {
  const catalogue = await loadCatalogue();
  const products = decorateAll(catalogue);
  const discounted = products.filter((p) => p.off > 0);

  return {
    shop: SHOP,
    fetched_at: catalogue.fetched_at,
    products,

    // The shop's overall score (F-06.08), added up by the API across the
    // same products this page renders. Not recomputed here: the star
    // totals it was summed from are not in the product shape, and a
    // second average over the rounded per-product ones would disagree
    // with the one printed on every card.
    rating: catalogue.rating ?? EMPTY.rating,

    categories: await getStorefrontCategories(products),
    fabrics: await getFabrics(products),
    // The deepest cut in the shop is no longer computed here. Nothing on the
    // page printed it except the offer banner's headline, and that headline
    // stopped quoting a percentage: a number that swings between 30% and 5%
    // with the stock makes the shop's loudest line loudest on its best week
    // and apologetic on its worst. `offerCount` is the honest half of that
    // pair — how many pieces are actually marked down — and it is the half
    // the banner kept.
    offerCount: discounted.length,
    entryPrice: products.length ? Math.min(...products.map((p) => p.price)) : 0,
    catalogueSize: products.length,
    sizeRange: sizeRange(products),
  };
}

/** "36 – 46" from whatever numeric sizes the catalogue actually carries. */
function sizeRange(products) {
  const numeric = new Set();

  for (const p of products) {
    for (const s of p.sizes) {
      if (/^\d+$/.test(s.size)) numeric.add(Number(s.size));
    }
  }

  if (!numeric.size) return null;

  return `${Math.min(...numeric)} – ${Math.max(...numeric)}`;
}
