/**
 * F-02 Category Management — the real REST layer.
 *
 * Talks to the Express routes under `/api/categories`, plus the two
 * product endpoints the category screens depend on (listing products so
 * a category can show what is in it, and reassigning products to a
 * category). Nothing here is mocked.
 *
 * Two shape translations happen in this file and nowhere else:
 *
 *   `fits` <-> `sizeCharts`
 *       The column is JSONB and the API validator rejects a bare array
 *       ("Fits must be a valid JSON object"), so the ordered chart list
 *       is wrapped as { charts: [...] } on the wire and unwrapped here.
 *
 *   multipart on write
 *       createCategory/updateCategory accept an optional `imageFile`.
 *       The backend uploads it to Cloudinary and stores the secure URL,
 *       so the browser never sends an image URL — only the file itself.
 */

import { api } from "./client";

// ============================================================
// WIRE <-> UI SHAPE
// ============================================================

/**
 * `fits` is whatever was last written to the JSONB column, so read it
 * defensively: the wrapper object is what this app writes, a bare array
 * is tolerated in case a row was seeded by hand.
 */
function readSizeCharts(fits) {
  if (Array.isArray(fits)) return fits;
  if (fits && Array.isArray(fits.charts)) return fits.charts;
  return [];
}

/** API DTO -> the shape every category component already expects. */
export function toCategory(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    slug: dto.slug ?? "",
    description: dto.description ?? "",
    image: dto.image ?? "",
    imagePublicId: dto.imagePublicId ?? null,
    active: Boolean(dto.active),
    sizeCharts: readSizeCharts(dto.fits),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * Only the five fields the validators allow — an unknown key is a 400
 * ("Field ... is not allowed"), so this must not leak `id`, `productIds`
 * or anything else the form carries around.
 *
 * Multipart values are all strings on arrival; the backend parses `fits`
 * and normalizes `active`, so JSON-encoding and stringifying here is what
 * it expects.
 */
function toFormData(fields, { partial = false } = {}) {
  const form = new FormData();
  const include = (key) => !partial || fields[key] !== undefined;

  if (include("name")) form.append("name", fields.name ?? "");
  if (include("slug")) form.append("slug", fields.slug ?? "");
  if (include("description")) form.append("description", fields.description ?? "");

  if (include("sizeCharts")) {
    form.append("fits", JSON.stringify({ charts: fields.sizeCharts ?? [] }));
  }

  if (include("active")) {
    form.append("active", String(fields.active ?? true));
  }

  // Absent on an edit that did not touch the banner — the backend then
  // leaves the stored Cloudinary image alone.
  if (fields.imageFile) form.append("image", fields.imageFile);

  return form;
}

// ============================================================
// CATEGORIES
// ============================================================

/**
 * The API caps `limit` at 100 and treats its `page` query param as an
 * offset (see CategoryController.getAll), so paging is done by offset.
 *
 * @returns {Promise<{categories: Array, pagination: object|null}>}
 */
export async function listCategories({ limit = 100, offset = 0, token, signal } = {}) {
  const { data, meta } = await api.get(
    `/categories/getAllCategories?limit=${limit}&page=${offset}`,
    { token, signal, envelope: true },
  );

  return {
    categories: (data ?? []).map(toCategory),
    pagination: meta?.pagination ?? null,
  };
}

export async function getCategory(id, { token, signal } = {}) {
  const data = await api.get(`/categories/getCategoryById/${encodeURIComponent(id)}`, {
    token,
    signal,
  });

  return toCategory(data);
}

export async function createCategory(fields, { token } = {}) {
  const data = await api.post("/categories/createCategory", toFormData(fields), {
    token,
  });

  return toCategory(data);
}

export async function updateCategory(id, patch, { token } = {}) {
  const data = await api.put(
    `/categories/updateCategory/${encodeURIComponent(id)}`,
    toFormData(patch, { partial: true }),
    { token },
  );

  return toCategory(data);
}

// ============================================================
// PRODUCTS, AS THE CATEGORY SCREENS NEED THEM
// ============================================================
//
// Not a general product client — /admin/products still has its own.
// These exist so the category views can show real linkages instead of
// a hard-coded product table.
//
// ============================================================

function toProduct(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    slug: dto.slug ?? "",
    categoryId: dto.categoryId == null ? null : String(dto.categoryId),
    basePrice: Number(dto.basePrice ?? 0),
    currentPrice: Number(dto.currentPrice ?? dto.basePrice ?? 0),
    discountPercentage: Number(dto.discountPercentage ?? 0),
    active: Boolean(dto.active),
  };
}

/**
 * Every product, walked page by page — the endpoint caps a page at 100
 * and the category screens need counts across the whole catalogue, not
 * one page of it. Capped at `maxPages` so a large catalogue degrades
 * into an undercount rather than a stalled panel.
 */
export async function listAllProducts({ maxPages = 10, token, signal } = {}) {
  const rows = [];

  for (let page = 1; page <= maxPages; page++) {
    const { data, meta } = await api.get(
      `/products/getAllProducts?page=${page}&limit=100`,
      { token, signal, envelope: true },
    );

    rows.push(...(data ?? []).map(toProduct));

    const totalPages = meta?.pagination?.totalPages ?? meta?.pagination?.pages;
    if (!data?.length || (totalPages && page >= totalPages)) break;
  }

  return rows;
}

/**
 * Moves products into a category. There is no inverse: `category_id` is
 * NOT NULL on products, so a product is always in exactly one category
 * and unlinking means linking somewhere else.
 */
export async function assignProductsToCategory(categoryId, productIds, { token } = {}) {
  if (!productIds?.length) return 0;

  const data = await api.post(
    "/products/bulkUpdateCategory",
    { categoryId, productIds },
    { token },
  );

  return data?.updatedCount ?? productIds.length;
}
