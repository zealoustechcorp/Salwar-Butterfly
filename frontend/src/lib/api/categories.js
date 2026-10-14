/**
 * Categories Management — the real REST layer.
 *
 * Talks to the Express routes under `/api/categories`, plus the two
 * product endpoints the category screens depend on (listing products so
 * a category can show what is in it, and reassigning products to a
 * category). Nothing here is mocked.
 *
 * One shape translation happens in this file and nowhere else:
 *
 *   multipart on write
 *       createCategory/updateCategory accept an optional `imageFile`.
 *       The backend uploads it to Cloudinary and stores the secure URL,
 *       so the browser never sends an image URL — only the file itself.
 *
 * The `fits` column is deliberately not read or written here. Size charts
 * are shop-wide (`size_charts`, see lib/api/sizeCharts.js), and nothing
 * ever projected `categories.fits` to the storefront.
 */

import { api } from "./client";

// ============================================================
// WIRE <-> UI SHAPE
// ============================================================

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
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * Only the fields the validators allow — an unknown key is a 400
 * ("Field ... is not allowed"), so this must not leak `id`, `productIds`
 * or anything else the form carries around.
 *
 * Multipart values are all strings on arrival; the backend normalizes
 * `active`, so stringifying here is what it expects.
 */
function toFormData(fields, { partial = false } = {}) {
  const form = new FormData();
  const include = (key) => !partial || fields[key] !== undefined;

  if (include("name")) form.append("name", fields.name ?? "");
  if (include("slug")) form.append("slug", fields.slug ?? "");
  if (include("description")) form.append("description", fields.description ?? "");

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

/** The API's own ceiling on `limit` (CategoryService.getAll clamps to it). */
const PAGE_SIZE = 100;

/** A runaway guard, not a real limit: 50 pages is 5,000 categories. */
const MAX_PAGES = 50;

/**
 * One page of `GET /categories/getAllCategories`.
 *
 * The meaning of `page` on that route has changed under us: it used to be
 * read as a raw offset (`page=100` meant "skip 100"); CategoryController
 * now reads it as a 1-based page number and takes an explicit `offset`,
 * which wins when both are sent. Both are sent here, computed so they
 * agree under either reading, so this walks the table correctly against
 * an API from before that change as well as after it. Which `page`
 * reading applies is decided from the first response (see
 * `pageParamFor`), never assumed.
 */
async function fetchCategoryPage({ query = "", token, signal }) {
  const { data, meta } = await api.get(
    `/categories/getAllCategories?limit=${PAGE_SIZE}${query}`,
    { token, signal, envelope: true },
  );

  return {
    categories: (data ?? []).map(toCategory),
    pagination: meta?.pagination ?? null,
  };
}

/**
 * The `page` value that asks for the `n`th page (1-based), given the
 * pagination block the first page came back with. A response that
 * reports a `page` number speaks 1-based pages; one that only echoes an
 * `offset` is the older offset-as-page reading.
 */
function pageParamFor(pagination, n, stride) {
  if (pagination && pagination.page !== undefined) return n;

  return (n - 1) * stride;
}

/**
 * Every category, newest first, paged through until the API's `total` is
 * reached. The admin category screens and the product form's category
 * picker both need the whole table — the first 100 rows used to be all
 * either of them ever saw, so category 101 could not be opened, edited or
 * picked.
 *
 * Rows are de-duplicated by id: a category created between two page
 * requests shifts every later row down by one, and the overlap would
 * otherwise show one category twice. A page that adds nothing new ends
 * the walk, which also stops a backend that ignores paging from looping.
 *
 * @returns {Promise<{categories: Array, pagination: object|null}>}
 */
export async function listCategories({ token, signal } = {}) {
  const first = await fetchCategoryPage({ token, signal });

  const byId = new Map(first.categories.map((category) => [category.id, category]));
  const total = Number(first.pagination?.total) || byId.size;
  const stride = Number(first.pagination?.limit) || PAGE_SIZE;

  for (let n = 2; byId.size < total && n <= MAX_PAGES; n++) {
    const offset = (n - 1) * stride;
    const page = pageParamFor(first.pagination, n, stride);

    const next = await fetchCategoryPage({
      query: `&page=${page}&offset=${offset}`,
      token,
      signal,
    });

    let added = 0;

    for (const category of next.categories) {
      if (byId.has(category.id)) continue;

      byId.set(category.id, category);
      added += 1;
    }

    if (added === 0) break;
  }

  return {
    categories: [...byId.values()],
    pagination: first.pagination,
  };
}

export async function getCategory(id, { token, signal } = {}) {
  const data = await api.get(`/categories/getCategoryById/${encodeURIComponent(id)}`, {
    token,
    signal,
  });

  return toCategory(data);
}

/**
 * Rewrites the older conflict shape into the field map the form reads.
 *
 * The category service's 409s used to send `errors: { field: "slug" }` —
 * the *name* of the field rather than a message for it — so the form
 * surfaced the bare word "slug" in its toast and never highlighted the
 * slug input. The service now sends `{ slug: "Category with this slug
 * already exists" }`; this keeps a backend that has not caught up
 * readable too, by pinning the error's own message on the named field.
 */
function withFieldMap(error) {
  const fields = error?.fields;

  if (
    fields &&
    typeof fields.field === "string" &&
    Object.keys(fields).length === 1
  ) {
    error.fields = { [fields.field]: error.message };
  }

  return error;
}

export async function createCategory(fields, { token } = {}) {
  try {
    const data = await api.post("/categories/createCategory", toFormData(fields), {
      token,
    });

    return toCategory(data);
  } catch (error) {
    throw withFieldMap(error);
  }
}

export async function updateCategory(id, patch, { token } = {}) {
  try {
    const data = await api.put(
      `/categories/updateCategory/${encodeURIComponent(id)}`,
      toFormData(patch, { partial: true }),
      { token },
    );

    return toCategory(data);
  } catch (error) {
    throw withFieldMap(error);
  }
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
