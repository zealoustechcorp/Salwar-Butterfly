/**
 * F-03 Product Management — mock service layer.
 *
 * Every function is async and returns the same shapes the real F-03 REST API
 * will return, so swapping this file for `fetch` calls is the only change the
 * UI needs. Validation mirrors the database constraints rather than duplicating
 * a second, looser set of rules:
 *
 *   uq_products_slug            -> unique slug
 *   uq_variant_sku              -> unique SKU
 *   uq_variant_product_combo    -> unique (product, size, colour)
 *   CHECK discount 0..100       -> percent range
 *   CHECK base_price >= 0       -> price range
 *   ON DELETE RESTRICT          -> ordered rows deactivate, never delete
 *
 * Errors follow one structure (FRS §6): { code, message, fields }.
 */

import {
  buildSku,
  db,
  productStock,
  resetDatabase,
  salePrice,
  slugify,
  stockStatus,
  variantPricing,
} from "@/lib/mock/store";

// --- plumbing ---------------------------------------------------------------

export class ApiError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
  }
}

/** Simulated round-trip so loading and error states are actually exercised. */
const latency = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms));

const nowIso = () => new Date().toISOString();

function touch(product) {
  product.updated_at = nowIso();
}

function findProduct(id) {
  const product = db.products.find((p) => p.id === Number(id));
  if (!product) throw new ApiError("not_found", `Product ${id} does not exist.`);
  return product;
}

function findVariant(id) {
  const variant = db.variants.find((v) => v.id === Number(id));
  if (!variant) throw new ApiError("not_found", `Variant ${id} does not exist.`);
  return variant;
}

// --- read: reference data ---------------------------------------------------

export async function getBootstrap() {
  await latency(120);
  return {
    categories: db.categories.map((c) => ({ ...c })),
    sizeCharts: db.sizeCharts.map((s) => ({ ...s })),
    attributes: JSON.parse(JSON.stringify(db.attributes)),
    settings: { ...db.settings },
  };
}

// --- read: list (F-03.01) ---------------------------------------------------

function decorate(product) {
  const category = db.categories.find((c) => c.id === product.category_id);
  const variants = db.variants
    .filter((v) => v.product_id === product.id)
    .map((v) => ({ ...v, pricing: variantPricing(v, product), stock_status: stockStatus(v) }));
  const images = db.images
    .filter((i) => i.product_id === product.id)
    .sort((a, b) => a.display_order - b.display_order);

  return {
    ...product,
    sale_price: salePrice(product),
    category_name: category ? category.name : "—",
    category_active: category ? category.is_active : false,
    stock: productStock(product.id),
    variants,
    images,
    primary_image: images.find((i) => i.is_primary) || images[0] || null,
    ordered_units: variants.reduce((sum, v) => sum + v.order_line_count, 0),
  };
}

/**
 * F-03.01 — paginated product list. The page size stays the FRS's 25
 * (`admin_products_per_page`), but the original "without pagination" wording is
 * superseded (client request 2026-08-20): the list now pages instead of
 * withholding overflow. `page` is 1-based and clamped, so a page left dangling
 * by a filter change or deletion falls back to the last real page instead of
 * rendering empty.
 */
export async function listProducts(query = {}) {
  await latency();
  const {
    search = "",
    categoryId = "all",
    status = "all", // all | active | inactive
    stock = "all", // all | in_stock | low_stock | out_of_stock
    discount = "all", // all | discounted | full_price
    fit = "all",
    sort = "newest",
    page = 1,
  } = query;

  const term = search.trim().toLowerCase();
  let rows = db.products.map(decorate);

  if (term) {
    rows = rows.filter((p) =>
      [p.name, p.slug, p.category_name, ...p.variants.map((v) => v.sku)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }
  if (categoryId !== "all") rows = rows.filter((p) => p.category_id === Number(categoryId));
  if (status !== "all") rows = rows.filter((p) => p.is_active === (status === "active"));
  if (fit !== "all") rows = rows.filter((p) => p.fit === fit);
  if (stock !== "all") rows = rows.filter((p) => p.stock.lowest_status === stock);
  if (discount !== "all")
    rows = rows.filter((p) =>
      discount === "discounted" ? p.discount_percent > 0 : p.discount_percent === 0,
    );

  const comparators = {
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    name_asc: (a, b) => a.name.localeCompare(b.name),
    name_desc: (a, b) => b.name.localeCompare(a.name),
    price_asc: (a, b) => a.sale_price - b.sale_price,
    price_desc: (a, b) => b.sale_price - a.sale_price,
    stock_asc: (a, b) => a.stock.total_stock - b.stock.total_stock,
    discount_desc: (a, b) => b.discount_percent - a.discount_percent,
  };
  rows.sort(comparators[sort] || comparators.newest);

  const limit = db.settings.admin_products_per_page;
  const matched = rows.length;
  const pages = Math.max(1, Math.ceil(matched / limit));
  const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  const start = (current - 1) * limit;

  return {
    rows: rows.slice(start, start + limit),
    matched,
    total: db.products.length,
    limit,
    page: current,
    pages,
  };
}

/** Header counters — computed over the whole catalogue, not the capped page. */
export async function getProductStats() {
  await latency(140);
  const statuses = db.variants.map((v) => stockStatus(v));
  return {
    total: db.products.length,
    active: db.products.filter((p) => p.is_active).length,
    inactive: db.products.filter((p) => !p.is_active).length,
    discounted: db.products.filter((p) => p.discount_percent > 0).length,
    variants: db.variants.length,
    low_stock: statuses.filter((s) => s === "low_stock").length,
    out_of_stock: statuses.filter((s) => s === "out_of_stock").length,
    units: db.variants
      .filter((v) => v.is_active)
      .reduce((sum, v) => sum + v.stock_quantity, 0),
  };
}

// --- read: detail (F-03.10) -------------------------------------------------

export async function getProduct(id) {
  await latency(180);
  const product = findProduct(id);
  const decorated = decorate(product);
  const chart = db.sizeCharts.find((s) => s.id === product.size_chart_id);
  return { ...decorated, size_chart_name: chart ? chart.name : null };
}

// --- write: validation ------------------------------------------------------

function validateProductInput(input, { productId = null } = {}) {
  const fields = {};

  if (!input.name || !input.name.trim()) fields.name = "Product name is required.";
  else if (input.name.trim().length > 200) fields.name = "Maximum 200 characters.";

  if (!input.category_id) fields.category_id = "Select a category.";

  const price = Number(input.base_price);
  if (input.base_price === "" || input.base_price === null || Number.isNaN(price))
    fields.base_price = "Base price is required.";
  else if (price < 0) fields.base_price = "Base price cannot be negative.";

  const discount = Number(input.discount_percent ?? 0);
  if (Number.isNaN(discount) || discount < 0 || discount > 100)
    fields.discount_percent = "Discount must be between 0 and 100.";

  const slug = slugify(input.slug || input.name || "");
  if (!slug) fields.slug = "Could not derive a URL slug from this name.";
  else if (db.products.some((p) => p.slug === slug && p.id !== productId))
    fields.slug = "Another product already uses this URL slug.";

  if (Object.keys(fields).length)
    throw new ApiError("validation_failed", "Please correct the highlighted fields.", fields);

  return { slug, price, discount };
}

/** uq_variant_product_combo + uq_variant_sku, checked before anything is written. */
function validateVariantRows(productId, rows, { ignoreVariantIds = [] } = {}) {
  const combos = new Set();
  const skus = new Set();
  const errors = [];

  const existing = db.variants.filter(
    (v) => v.product_id === productId && !ignoreVariantIds.includes(v.id),
  );
  for (const v of existing) combos.add(`${v.size}|${v.colour}`.toLowerCase());

  const otherSkus = new Set(
    db.variants.filter((v) => !ignoreVariantIds.includes(v.id)).map((v) => v.sku),
  );

  rows.forEach((row, index) => {
    if (!row.size) errors.push({ index, message: "Size is required." });
    if (!row.colour) errors.push({ index, message: "Colour is required." });
    if (Number(row.stock_quantity) < 0)
      errors.push({ index, message: "Stock cannot be negative." });

    const combo = `${row.size}|${row.colour}`.toLowerCase();
    if (combos.has(combo))
      errors.push({ index, message: `${row.size} / ${row.colour} already exists on this product.` });
    combos.add(combo);

    if (row.sku) {
      if (otherSkus.has(row.sku) || skus.has(row.sku))
        errors.push({ index, message: `SKU ${row.sku} is already in use.` });
      skus.add(row.sku);
    }
  });

  if (errors.length)
    throw new ApiError("variant_conflict", "Some variants could not be saved.", { variants: errors });
}

function insertVariants(product, rows) {
  return rows.map((row) => {
    const variant = {
      id: db.nextVariantId(),
      product_id: product.id,
      sku:
        row.sku ||
        buildSku({
          categoryId: product.category_id,
          productId: product.id,
          size: row.size,
          colour: row.colour,
        }),
      size: row.size,
      colour: row.colour,
      colour_hex: row.colour_hex || "#94a3b8",
      price_override: row.price_override === "" || row.price_override == null ? null : Number(row.price_override),
      discount_percent_override:
        row.discount_percent_override === "" || row.discount_percent_override == null
          ? null
          : Number(row.discount_percent_override),
      stock_quantity: Number(row.stock_quantity) || 0,
      low_stock_threshold: null,
      out_of_stock_threshold: null,
      is_active: row.is_active ?? true,
      order_line_count: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.variants.push(variant);
    return variant;
  });
}

function insertImages(product, specs) {
  return specs.map((spec, i) => {
    const image = {
      id: db.nextImageId(),
      product_id: product.id,
      variant_id: spec.variant_id ?? null,
      image_url:
        spec.image_url ||
        `https://res.cloudinary.com/salwar-butterfly/image/upload/v1/products/${product.slug}-${Date.now()}-${i}.jpg`,
      image_public_id: spec.image_public_id || `products/${product.slug}-${Date.now()}-${i}`,
      alt_text: spec.alt_text || product.name,
      display_order: spec.display_order ?? i,
      is_primary: false,
      swatch_hex: spec.swatch_hex || "#c21e56",
      swatch_seed: spec.swatch_seed ?? Math.floor(Math.random() * 997),
    };
    db.images.push(image);
    return image;
  });
}

/** uq_images_one_primary — exactly one primary per product. */
function ensureSinglePrimary(productId) {
  const rows = db.images
    .filter((i) => i.product_id === productId)
    .sort((a, b) => a.display_order - b.display_order);
  const explicit = rows.find((i) => i.is_primary);
  const chosen = explicit || rows.find((i) => i.variant_id === null) || rows[0];
  for (const row of rows) row.is_primary = chosen ? row.id === chosen.id : false;
}

// --- write: create / edit (F-03.02, F-03.03, F-03.05, F-03.07, F-03.08) -----

export async function createProduct(input) {
  await latency(420);
  const { slug, price, discount } = validateProductInput(input);

  const variantRows = input.variants || [];
  if (!variantRows.length)
    throw new ApiError("validation_failed", "Add at least one variant — variants are the sellable unit.", {
      variants: [{ index: -1, message: "At least one size / colour combination is required." }],
    });

  const product = {
    id: db.nextProductId(),
    name: input.name.trim(),
    slug,
    description: input.description || "",
    category_id: Number(input.category_id),
    size_chart_id: input.size_chart_id ? Number(input.size_chart_id) : null,
    fit: input.fit || null,
    base_price: price,
    discount_percent: discount,
    is_active: input.is_active ?? true,
    is_featured: input.is_featured ?? false,
    attributes: input.attributes || {},
    published_at: (input.is_active ?? true) ? nowIso() : null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  validateVariantRows(product.id, variantRows);
  db.products.push(product);

  const created = insertVariants(product, variantRows);

  // Variant image specs reference variants by their row index in the form.
  const imageSpecs = (input.images || []).map((spec) =>
    spec.variant_index != null && created[spec.variant_index]
      ? { ...spec, variant_id: created[spec.variant_index].id }
      : spec,
  );
  insertImages(product, imageSpecs);
  ensureSinglePrimary(product.id);

  return decorate(product);
}

export async function updateProduct(id, patch) {
  await latency(360);
  const product = findProduct(id);
  const merged = { ...product, ...patch };
  const { slug, price, discount } = validateProductInput(merged, { productId: product.id });

  product.name = merged.name.trim();
  product.slug = slug;
  product.description = merged.description || "";
  product.category_id = Number(merged.category_id);
  product.size_chart_id = merged.size_chart_id ? Number(merged.size_chart_id) : null;
  product.fit = merged.fit || null;
  product.base_price = price;
  product.discount_percent = discount;
  product.is_featured = merged.is_featured ?? false;
  product.attributes = merged.attributes || {};

  if (patch.is_active !== undefined && patch.is_active !== product.is_active) {
    product.is_active = patch.is_active;
    if (product.is_active && !product.published_at) product.published_at = nowIso();
  }

  touch(product);
  return decorate(product);
}

// --- write: bulk upload (F-03.04) -------------------------------------------

/**
 * One product, many variants, a different image set per colour — description,
 * sizes and price are shared, exactly as the FRS words it.
 *
 * `colourGroups`: [{ colour, colour_hex, stock, images: [{...}] }]
 * `sizes`:        ["S", "M", "L"]  — applied to every colour group
 */
export async function bulkCreateProduct(input) {
  await latency(700);
  const { slug, price, discount } = validateProductInput(input);

  const sizes = input.sizes || [];
  const groups = input.colourGroups || [];

  const fields = {};
  if (!sizes.length) fields.sizes = "Pick at least one size.";
  if (!groups.length) fields.colours = "Add at least one colour.";
  if (groups.some((g) => !g.colour)) fields.colours = "Every colour row needs a colour.";
  if (Object.keys(fields).length)
    throw new ApiError("validation_failed", "Bulk upload is incomplete.", fields);

  const productId = db.nextProductId();
  const rows = [];
  for (const group of groups) {
    for (const size of sizes) {
      rows.push({
        size,
        colour: group.colour,
        colour_hex: group.colour_hex,
        stock_quantity: Number(group.stock ?? 0),
        is_active: true,
      });
    }
  }
  validateVariantRows(productId, rows);

  const product = {
    id: productId,
    name: input.name.trim(),
    slug,
    description: input.description || "",
    category_id: Number(input.category_id),
    size_chart_id: input.size_chart_id ? Number(input.size_chart_id) : null,
    fit: input.fit || null,
    base_price: price,
    discount_percent: discount,
    is_active: input.is_active ?? true,
    is_featured: false,
    attributes: input.attributes || {},
    published_at: (input.is_active ?? true) ? nowIso() : null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  db.products.push(product);

  const created = insertVariants(product, rows);

  // Attach each group's images to every variant of that colour. Images with a
  // variant_id swap in when the shopper picks that colour (DB §6.9).
  let imageCount = 0;
  for (const group of groups) {
    const target = created.find((v) => v.colour === group.colour);
    if (!target) continue;
    const specs = (group.images || []).map((img, i) => ({
      ...img,
      variant_id: target.id,
      display_order: i,
      swatch_hex: group.colour_hex,
      alt_text: `${product.name} in ${group.colour}`,
    }));
    insertImages(product, specs);
    imageCount += specs.length;
  }
  ensureSinglePrimary(product.id);

  return {
    product: decorate(product),
    summary: {
      variants_created: created.length,
      colours: groups.length,
      sizes: sizes.length,
      images_created: imageCount,
    },
  };
}

// --- write: variants (F-03.03) ----------------------------------------------

export async function addVariants(productId, rows) {
  await latency(320);
  const product = findProduct(productId);
  validateVariantRows(product.id, rows);
  const created = insertVariants(product, rows);
  touch(product);
  return created;
}

export async function updateVariant(variantId, patch) {
  await latency(240);
  const variant = findVariant(variantId);
  const product = findProduct(variant.product_id);

  const next = { ...variant, ...patch };
  if (Number(next.stock_quantity) < 0)
    throw new ApiError("validation_failed", "Stock cannot be negative.", {
      stock_quantity: "Stock cannot be negative.",
    });
  if (
    next.discount_percent_override != null &&
    next.discount_percent_override !== "" &&
    (Number(next.discount_percent_override) < 0 || Number(next.discount_percent_override) > 100)
  )
    throw new ApiError("validation_failed", "Discount must be between 0 and 100.", {
      discount_percent_override: "Must be between 0 and 100.",
    });

  if (patch.size || patch.colour)
    validateVariantRows(
      product.id,
      [{ size: next.size, colour: next.colour, stock_quantity: next.stock_quantity }],
      { ignoreVariantIds: [variant.id] },
    );

  Object.assign(variant, {
    size: next.size,
    colour: next.colour,
    colour_hex: next.colour_hex,
    sku: next.sku,
    stock_quantity: Number(next.stock_quantity),
    price_override:
      next.price_override === "" || next.price_override == null ? null : Number(next.price_override),
    discount_percent_override:
      next.discount_percent_override === "" || next.discount_percent_override == null
        ? null
        : Number(next.discount_percent_override),
    is_active: next.is_active,
    updated_at: nowIso(),
  });
  touch(product);
  return { ...variant, pricing: variantPricing(variant, product), stock_status: stockStatus(variant) };
}

// --- write: activate / deactivate / delete (F-03.11) ------------------------

export async function setActive({ productIds = [], variantIds = [], active }) {
  await latency(380);
  let products = 0;
  let variants = 0;

  for (const id of productIds) {
    const product = findProduct(id);
    product.is_active = active;
    if (active && !product.published_at) product.published_at = nowIso();
    // Deactivating a product takes its variants off the storefront with it.
    for (const v of db.variants.filter((v) => v.product_id === product.id)) {
      if (!active) v.is_active = false;
      v.updated_at = nowIso();
    }
    touch(product);
    products++;
  }

  for (const id of variantIds) {
    const variant = findVariant(id);
    variant.is_active = active;
    variant.updated_at = nowIso();
    touch(findProduct(variant.product_id));
    variants++;
  }

  return {
    products,
    variants,
    message: `${active ? "Activated" : "Deactivated"} ${products} product${products === 1 ? "" : "s"}${
      variants ? ` and ${variants} variant${variants === 1 ? "" : "s"}` : ""
    }.`,
  };
}

/**
 * Business rule behind F-03.11's "subject to business rules": anything that
 * appears on an order is an immutable financial record's dependency
 * (ON DELETE RESTRICT), so it can only be deactivated. Deletion is reserved for
 * rows that have never sold.
 */
export function assessDeletion({ productIds = [], variantIds = [] }) {
  const deletable = { products: [], variants: [] };
  const blocked = [];

  for (const id of productIds) {
    const product = db.products.find((p) => p.id === Number(id));
    if (!product) continue;
    const sold = db.variants
      .filter((v) => v.product_id === product.id)
      .reduce((sum, v) => sum + v.order_line_count, 0);
    if (sold > 0)
      blocked.push({
        kind: "product",
        id: product.id,
        label: product.name,
        reason: `Appears on ${sold} order line${sold === 1 ? "" : "s"} — deactivate instead.`,
      });
    else deletable.products.push(product.id);
  }

  for (const id of variantIds) {
    const variant = db.variants.find((v) => v.id === Number(id));
    if (!variant) continue;
    if (variant.order_line_count > 0)
      blocked.push({
        kind: "variant",
        id: variant.id,
        label: variant.sku,
        reason: `Appears on ${variant.order_line_count} order line${
          variant.order_line_count === 1 ? "" : "s"
        } — deactivate instead.`,
      });
    else deletable.variants.push(variant.id);
  }

  return { deletable, blocked };
}

export async function deleteEntities({ productIds = [], variantIds = [] }) {
  await latency(420);
  const { deletable, blocked } = assessDeletion({ productIds, variantIds });

  for (const id of deletable.products) {
    db.products = db.products.filter((p) => p.id !== id);
    db.variants = db.variants.filter((v) => v.product_id !== id); // ON DELETE CASCADE
    db.images = db.images.filter((i) => i.product_id !== id);
  }
  for (const id of deletable.variants) {
    const variant = db.variants.find((v) => v.id === id);
    db.variants = db.variants.filter((v) => v.id !== id);
    db.images = db.images.filter((i) => i.variant_id !== id);
    if (variant) {
      const product = db.products.find((p) => p.id === variant.product_id);
      if (product) touch(product);
    }
  }

  return {
    deleted_products: deletable.products.length,
    deleted_variants: deletable.variants.length,
    blocked,
  };
}

// --- write: discount (F-03.12) ----------------------------------------------

/**
 * Percentage-based, per product *or* per variant. Removing an offer is
 * percent = 0 on the product, or clearing the override on a variant.
 */
export async function applyDiscount({ productIds = [], variantIds = [], percent }) {
  await latency(380);
  const value = Number(percent);
  if (Number.isNaN(value) || value < 0 || value > 100)
    throw new ApiError("validation_failed", "Discount must be between 0 and 100.", {
      percent: "Enter a value between 0 and 100.",
    });

  for (const id of productIds) {
    const product = findProduct(id);
    product.discount_percent = value;
    touch(product);
  }
  for (const id of variantIds) {
    const variant = findVariant(id);
    variant.discount_percent_override = value;
    variant.updated_at = nowIso();
    touch(findProduct(variant.product_id));
  }

  return {
    percent: value,
    products: productIds.length,
    variants: variantIds.length,
    message: `${value}% offer applied to ${productIds.length} product${
      productIds.length === 1 ? "" : "s"
    }${variantIds.length ? ` and ${variantIds.length} variant${variantIds.length === 1 ? "" : "s"}` : ""}.`,
  };
}

export async function removeDiscount({ productIds = [], variantIds = [] }) {
  await latency(340);
  for (const id of productIds) {
    const product = findProduct(id);
    product.discount_percent = 0;
    touch(product);
  }
  for (const id of variantIds) {
    const variant = findVariant(id);
    variant.discount_percent_override = null;
    variant.updated_at = nowIso();
    touch(findProduct(variant.product_id));
  }
  return {
    message: `Offer removed from ${productIds.length} product${productIds.length === 1 ? "" : "s"}${
      variantIds.length ? ` and ${variantIds.length} variant${variantIds.length === 1 ? "" : "s"}` : ""
    }.`,
  };
}

// --- write: images (F-03.06) ------------------------------------------------

export async function addProductImages(productId, specs) {
  await latency(500);
  const product = findProduct(productId);
  const existing = db.images.filter((i) => i.product_id === product.id).length;
  const created = insertImages(
    product,
    specs.map((s, i) => ({ ...s, display_order: existing + i })),
  );
  ensureSinglePrimary(product.id);
  touch(product);
  return created;
}

export async function setPrimaryImage(imageId) {
  await latency(200);
  const image = db.images.find((i) => i.id === Number(imageId));
  if (!image) throw new ApiError("not_found", "Image not found.");
  if (image.variant_id !== null)
    throw new ApiError(
      "invalid_state",
      "Only a product-gallery image can be the primary image — detach it from the variant first.",
    );
  for (const row of db.images.filter((i) => i.product_id === image.product_id))
    row.is_primary = row.id === image.id;
  touch(findProduct(image.product_id));
  return { ok: true };
}

export async function updateImage(imageId, patch) {
  await latency(200);
  const image = db.images.find((i) => i.id === Number(imageId));
  if (!image) throw new ApiError("not_found", "Image not found.");
  if (patch.variant_id !== undefined)
    image.variant_id = patch.variant_id === "" || patch.variant_id == null ? null : Number(patch.variant_id);
  if (patch.alt_text !== undefined) image.alt_text = patch.alt_text;
  ensureSinglePrimary(image.product_id);
  touch(findProduct(image.product_id));
  return { ...image };
}

export async function reorderImages(productId, orderedIds) {
  await latency(200);
  orderedIds.forEach((id, index) => {
    const image = db.images.find((i) => i.id === Number(id));
    if (image) image.display_order = index;
  });
  touch(findProduct(productId));
  return { ok: true };
}

export async function removeImage(imageId) {
  await latency(240);
  const image = db.images.find((i) => i.id === Number(imageId));
  if (!image) throw new ApiError("not_found", "Image not found.");
  const productId = image.product_id;
  db.images = db.images.filter((i) => i.id !== image.id);
  ensureSinglePrimary(productId);
  touch(findProduct(productId));
  return { ok: true };
}

// --- write: approved attributes (F-03.09) -----------------------------------

export async function setAttributeApproval(group, value, approved) {
  await latency(180);
  const list = db.attributes[group];
  if (!list) throw new ApiError("not_found", `Unknown attribute group "${group}".`);
  const entry = list.find((a) => a.value === value);
  if (!entry) throw new ApiError("not_found", `Unknown value "${value}".`);

  if (!approved) {
    const inUse = db.variants.filter(
      (v) => (group === "sizes" && v.size === value) || (group === "colours" && v.colour === value),
    ).length;
    entry.approved = false;
    return {
      ...entry,
      in_use: inUse,
      message: inUse
        ? `"${value}" is no longer offered for new variants. ${inUse} existing variant${
            inUse === 1 ? "" : "s"
          } keep it.`
        : `"${value}" is no longer offered for new variants.`,
    };
  }

  entry.approved = true;
  return { ...entry, message: `"${value}" is approved for new variants.` };
}

export async function addAttributeValue(group, entry) {
  await latency(180);
  const list = db.attributes[group];
  if (!list) throw new ApiError("not_found", `Unknown attribute group "${group}".`);
  const value = String(entry.value || "").trim();
  if (!value) throw new ApiError("validation_failed", "Enter a value.", { value: "Required." });
  if (list.some((a) => a.value.toLowerCase() === value.toLowerCase()))
    throw new ApiError("validation_failed", `"${value}" already exists.`, { value: "Already exists." });

  const created = {
    value,
    approved: true,
    ...(group === "colours" ? { hex: entry.hex || "#94a3b8" } : {}),
    ...(group === "sizes" ? { sort: list.length + 1 } : {}),
  };
  list.push(created);
  return created;
}

// --- demo control -----------------------------------------------------------

export async function resetDemoData() {
  await latency(300);
  resetDatabase();
  return { ok: true };
}
