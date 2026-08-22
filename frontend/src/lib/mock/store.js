/**
 * In-memory mock database for F-03.
 *
 * Expands the compact seed into the normalised tables of the v2 schema and
 * exposes the derived logic the real database provides as views:
 *   v_variant_pricing      -> variantPricing()
 *   v_variant_stock_status -> stockStatus()
 *   v_product_stock        -> productStock()
 *
 * The store is a module singleton, so edits made in one admin screen are still
 * there after a client-side navigation to another. A hard browser reload
 * re-seeds — which is the intended behaviour for a static-data demo.
 */

import { ATTRIBUTES, CATEGORIES, PRODUCT_SEED, SETTINGS, SIZE_CHARTS } from "./seed";

const clone = (v) => JSON.parse(JSON.stringify(v));

// --- id sequences -----------------------------------------------------------

function sequence(start) {
  let n = start;
  return () => ++n;
}

// --- helpers ----------------------------------------------------------------

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 220);
}

const CATEGORY_CODE = {
  1: "ANK",
  2: "KRT",
  3: "PLZ",
  4: "CHD",
  5: "SHR",
  6: "PTL",
  7: "CDW",
  8: "GWN",
};

function colourCode(colour) {
  const words = String(colour).trim().split(/\s+/);
  const letters =
    words.length > 1
      ? words.map((w) => w[0]).join("") + words[words.length - 1].slice(1, 2)
      : words[0].slice(0, 3);
  return letters.toUpperCase().slice(0, 3);
}

/** SKU shape: SB-<CAT>-<PRODUCT>-<SIZE>-<COLOUR>, e.g. SB-ANK-0001-M-RNP */
export function buildSku({ categoryId, productId, size, colour }) {
  const cat = CATEGORY_CODE[categoryId] || "GEN";
  const pid = String(productId).padStart(4, "0");
  return `SB-${cat}-${pid}-${String(size).toUpperCase()}-${colourCode(colour)}`;
}

function hexFor(colour) {
  const found = ATTRIBUTES.colours.find((c) => c.value === colour);
  return found ? found.hex : "#94a3b8";
}

function iso(date) {
  return date ? `${date}T09:30:00+05:30` : null;
}

// --- table construction -----------------------------------------------------

function buildDatabase() {
  const products = [];
  const variants = [];
  const images = [];

  const nextVariantId = sequence(0);
  const nextImageId = sequence(0);

  for (const seed of PRODUCT_SEED) {
    const product = {
      id: seed.id,
      name: seed.name,
      slug: slugify(seed.name),
      description: seed.description,
      category_id: seed.category_id,
      size_chart_id: seed.size_chart_id,
      fit: seed.fit,
      base_price: seed.base_price,
      discount_percent: seed.discount_percent,
      is_active: seed.is_active,
      is_featured: seed.is_featured,
      attributes: { ...seed.attrs },
      published_at: iso(seed.published_at),
      created_at: iso(seed.created_at),
      updated_at: iso(seed.created_at),
    };
    products.push(product);

    // Product-level gallery: variant_id NULL (DB §6.9).
    for (let i = 0; i < seed.gallery; i++) {
      const id = nextImageId();
      images.push({
        id,
        product_id: seed.id,
        variant_id: null,
        image_url: `https://res.cloudinary.com/salwar-butterfly/image/upload/v1/products/${product.slug}-${i + 1}.jpg`,
        image_public_id: `products/${product.slug}-${i + 1}`,
        alt_text: `${product.name} — view ${i + 1}`,
        display_order: i,
        is_primary: i === 0,
        swatch_hex: hexFor(seed.variants[0].colour),
        swatch_seed: seed.id * 17 + i * 5,
      });
    }

    // One variant-scoped image per distinct colour — this is what makes
    // F-03.04 (different images per variant) real.
    const seenColours = new Set();

    for (const v of seed.variants) {
      const variantId = nextVariantId();
      variants.push({
        id: variantId,
        product_id: seed.id,
        sku: buildSku({
          categoryId: seed.category_id,
          productId: seed.id,
          size: v.size,
          colour: v.colour,
        }),
        size: v.size,
        colour: v.colour,
        colour_hex: hexFor(v.colour),
        price_override: v.price_override ?? null,
        discount_percent_override: v.discount_percent_override ?? null,
        stock_quantity: v.stock,
        low_stock_threshold: null,
        out_of_stock_threshold: null,
        is_active: v.is_active ?? true,
        order_line_count: v.sold ?? 0, // drives the F-03.11 delete rule
        created_at: product.created_at,
        updated_at: product.created_at,
      });

      if (!seenColours.has(v.colour)) {
        seenColours.add(v.colour);
        const id = nextImageId();
        images.push({
          id,
          product_id: seed.id,
          variant_id: variantId,
          image_url: `https://res.cloudinary.com/salwar-butterfly/image/upload/v1/products/${product.slug}-${slugify(v.colour)}.jpg`,
          image_public_id: `products/${product.slug}-${slugify(v.colour)}`,
          alt_text: `${product.name} in ${v.colour}`,
          display_order: 0,
          is_primary: false,
          swatch_hex: hexFor(v.colour),
          swatch_seed: variantId * 13,
        });
      }
    }
  }

  return {
    categories: clone(CATEGORIES),
    sizeCharts: clone(SIZE_CHARTS),
    attributes: clone(ATTRIBUTES),
    settings: { ...SETTINGS },
    products,
    variants,
    images,
    nextProductId: sequence(PRODUCT_SEED.length),
    nextVariantId,
    nextImageId,
  };
}

export const db = buildDatabase();

/** Restores every table to its seeded state — used by the "Reset demo data" action. */
export function resetDatabase() {
  const fresh = buildDatabase();
  for (const key of Object.keys(fresh)) db[key] = fresh[key];
}

// --- derived logic (the DB's views, in JS) -----------------------------------

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** products.sale_price — a generated column in PostgreSQL. */
export function salePrice(product) {
  return round2((product.base_price * (100 - product.discount_percent)) / 100);
}

/** v_variant_pricing — variant overrides fall back to the product. */
export function variantPricing(variant, product) {
  const unitPrice = variant.price_override ?? product.base_price;
  const discount = variant.discount_percent_override ?? product.discount_percent;
  return {
    unit_price: unitPrice,
    discount_percent: discount,
    sale_price: round2((unitPrice * (100 - discount)) / 100),
    has_override:
      variant.price_override !== null || variant.discount_percent_override !== null,
    is_purchasable: variant.is_active && product.is_active,
  };
}

/** v_variant_stock_status — F-04.05 / F-04.06 thresholds. */
export function stockStatus(variant) {
  if (!variant.is_active) return "unavailable";
  const outAt = variant.out_of_stock_threshold ?? db.settings.out_of_stock_threshold;
  const lowAt = variant.low_stock_threshold ?? db.settings.low_stock_threshold;
  if (variant.stock_quantity <= outAt) return "out_of_stock";
  if (variant.stock_quantity <= lowAt) return "low_stock";
  return "in_stock";  
}

/** v_product_stock — replaces v1's products.stock column. */
export function productStock(productId) {
  const rows = db.variants.filter((v) => v.product_id === productId);
  const active = rows.filter((v) => v.is_active);
  return {
    total_stock: active.reduce((sum, v) => sum + v.stock_quantity, 0),
    variant_count: rows.length,
    active_variant_count: active.length,
    has_in_stock: active.some((v) => stockStatus(v) === "in_stock"),
    lowest_status: active.some((v) => stockStatus(v) === "out_of_stock")
      ? "out_of_stock"
      : active.some((v) => stockStatus(v) === "low_stock")
        ? "low_stock"
        : active.length
          ? "in_stock"
          : "unavailable",
  };
}
