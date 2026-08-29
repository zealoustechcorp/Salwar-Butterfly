/**
 * Storefront read model (F-06 Product Browsing) — the customer's view of the
 * real Salwar Butterfly catalogue.
 *
 * The data is a committed snapshot of the live shop
 * (`scripts/snapshot-live-catalogue.mjs` → `live-catalogue.json`): real
 * products, real prices, real per-size stock and the shop's own Cloudinary
 * photography. The storefront stays frontend-only — nothing here fetches at
 * runtime. Re-run the script to refresh.
 *
 * The admin console keeps its own FRS seed in `src/lib/mock/store.js`; the two
 * are deliberately separate, since that seed models the v2 schema and this
 * models what the shop actually sells today.
 */

import snapshot from "./live-catalogue.json";

// --- presentation lookups ---------------------------------------------------

/** One-line merchandising copy per live category. */
const CATEGORY_BLURB = {
  5: "The everyday straight cut — dhabu, azrak and south cotton",
  1: "Matching top-and-pant co-ords, ready to wear together",
  3: "A-line flare that skims rather than clings",
  2: "Heavy-flare anarkalis for weddings and festivals",
  4: "Smart tops, maxis and pants for the off-duty week",
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

// The shop treats a piece as running low once only a couple are left; below
// that the size chip is simply not offered.
const LOW_STOCK_AT = 3;

// --- decoration -------------------------------------------------------------

function decorate(product, categoryName) {
  const sizes = product.sizes.filter((s) => s.stock > 0);
  const inStock = product.stock > 0 && sizes.length > 0;

  return {
    ...product,
    category_name: categoryName,
    fabric: fabricOf(product.name),
    saving: product.mrp ? product.mrp - product.price : 0,
    // Only sizes actually on the shelf are selectable.
    sizes: product.sizes,
    available_sizes: sizes.map((s) => s.size),
    in_stock: inStock,
    is_low_stock: inStock && product.stock <= LOW_STOCK_AT,
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

/** Active categories with the counts and entry price the tiles show. */
export function getStorefrontCategories(products = getStorefrontProducts()) {
  return snapshot.categories.map((category) => {
    const rows = products.filter((p) => p.category_id === category.id);
    return {
      ...category,
      blurb: CATEGORY_BLURB[category.id] || "",
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
