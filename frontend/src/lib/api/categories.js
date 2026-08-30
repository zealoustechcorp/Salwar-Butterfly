/**
 * Categories Management — the real REST layer.
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
// PRODUCTS
// ============================================================
//
// The category views report on their linkage — how many products, which
// ones, are they live — so they read products too. That client lives in
// `./products` and is imported from there directly: this module must not
// depend on it, because `./products` imports `listCategories` from here
// to populate its category picker.
//
// ============================================================
