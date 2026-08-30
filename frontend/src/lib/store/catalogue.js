/**
 * Storefront read model (F-06 Product Browsing) — the customer's view of the
 * real Salwar Butterfly catalogue.
 *
 * The data is a committed snapshot of the shop's own database
 * (`backend: npm run db:export-storefront` → `live-catalogue.json`): real
 * products, real prices, real per-size stock and the shop's own Cloudinary
 * photography. The storefront stays frontend-only — nothing here fetches at
 * runtime, so all 197 pieces prerender as static pages. Re-run the export
 * whenever stock moves.
 *
 * Two things changed when checkout became real (F-07).
 *
 * The snapshot now comes from *this* project's Postgres rather than the old
 * shop's API, so ids are UUIDs and a page points at a row that exists here.
 * They are opaque strings — never parse or compare them numerically.
 *
 * Every size carries a `variant_id`. That is what a bag line is ordered
 * against: a size label alone identifies nothing the API can sell.
 */

import { STOCK_STATUS, stockStatusFor } from "@/lib/stock";

import snapshot from "./live-catalogue.json";

// --- presentation lookups ---------------------------------------------------

/**
 * One-line merchandising copy per live category.
 *
 * Keyed by name, not id. The ids are UUIDs now and would change if the
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
    saving: product.mrp ? product.mrp - product.price : 0,
    // Something a shopper can read out over the phone. The id is a UUID and
    // unusable for that; the first block is short, stable and distinct enough
    // across a catalogue this size.
    piece_code: `SB-${String(product.id).slice(0, 8).toUpperCase()}`,
    // Every size, each carrying the variant_id a bag line is ordered against.
    sizes: product.sizes,
    // Only sizes actually on the shelf are selectable.
    available_sizes: sizes.map((s) => s.size),
    in_stock: inStock,
    is_low_stock: inStock && stockStatusFor(product.stock) === STOCK_STATUS.LOW_STOCK,
  };
}

// --- queries ----------------------------------------------------------------

/** The shop's own name, contacts, banners and trust badges. */
export function getShop() {
  return snapshot.shop;
}

export function getFetchedAt() {
  return snapshot.fetched_at;
}

/** Everything a shopper can see, newest first. */
export function getStorefrontProducts() {
  const names = new Map(snapshot.categories.map((c) => [c.id, c.name]));

  return snapshot.products
    .map((p) => decorate(p, names.get(p.category_id) || "—"))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * One product, decorated exactly as the grid's cards are.
 *
 * Ids come out of a URL segment and are matched as opaque strings — an id
 * that is not in the snapshot is a miss rather than a crash, and the route
 * turns that into a 404.
 */
export function getStorefrontProduct(id) {
  const productId = String(id ?? "");
  if (!productId) return null;

  const row = snapshot.products.find((p) => p.id === productId);
  if (!row) return null;

  const names = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  return decorate(row, names.get(row.category_id) || "—");
}

/** Every product id, as route segments — what the detail route prerenders. */
export function getProductIds() {
  return snapshot.products.map((p) => String(p.id));
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
export function getRelatedProducts(product, limit = 4) {
  if (!product) return [];

  const all = getStorefrontProducts().filter((p) => p.id !== product.id);
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

/** Active categories with the counts and entry price the tiles show. */
export function getStorefrontCategories(products = getStorefrontProducts()) {
  return snapshot.categories.map((category) => {
    const rows = products.filter((p) => p.category_id === category.id);
    return {
      ...category,
      blurb: CATEGORY_BLURB[category.name] || "",
      from_price: rows.length ? Math.min(...rows.map((p) => p.price)) : null,
      // Fall back to a product photo if the category has no cover image.
      image: category.image || rows[0]?.image || null,
    };
  });
}

/** Distinct fabrics across the catalogue — the "shop by fabric" chips. */
export function getFabrics(products = getStorefrontProducts()) {
  const counts = new Map();
  for (const p of products) {
    if (p.fabric) counts.set(p.fabric, (counts.get(p.fabric) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Everything the home page renders, computed once on the server.
 *
 * The whole catalogue ships with it: the shop section filters and re-sorts
 * client-side, so browsing by category, fabric or search term is instant and
 * needs no request.
 */
export function getHomePageData() {
  const products = getStorefrontProducts();
  const discounted = products.filter((p) => p.off > 0);

  return {
    shop: snapshot.shop,
    fetched_at: snapshot.fetched_at,
    products,
    categories: getStorefrontCategories(products),
    fabrics: getFabrics(products),
    topDiscount: discounted.reduce((max, p) => Math.max(max, p.off), 0),
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
