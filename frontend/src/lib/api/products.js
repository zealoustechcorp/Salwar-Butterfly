/**
 * Product Management — the real REST layer.
 *
 * Talks to the Express routes under `/api/products`, plus the two
 * reference endpoints the product screens need to resolve a product's
 * category and sub-category to a name. Nothing here is mocked: an empty
 * catalogue means an empty `products` table.
 *
 * Three things the API does *not* do, handled here so callers see one
 * coherent product client:
 *
 *   search / sort / stats
 *       `GET /products/getAllProducts` pages, and filters only by
 *       category and active flag. Everything else the admin list offers
 *       — text search, sort order, offer filter, the header counters —
 *       is derived from a full walk of the catalogue (`listAllProducts`),
 *       because a counter computed over one page would be wrong.
 *
 *   changing a product's category
 *       `PUT /products/updateProduct/:id` ignores `categoryId`; moving a
 *       product between categories is `POST /products/bulkUpdateCategory`.
 *       `updateProduct` below hides that split.
 *
 *   multi-row writes
 *       There is no bulk activate / discount / delete endpoint, so those
 *       fan out to one request per product and report what succeeded.
 *
 * Errors are the `ApiError` thrown by the shared client — { code,
 * message, fields, status }.
 */

import { listCategories } from "./categories";
import { api, ApiError } from "./client";

export { ApiError };

/** The API caps a page at 100 rows. */
const MAX_PAGE_SIZE = 100;

/** Rows per page in the admin list. */
export const PAGE_SIZE = 24;

// ============================================================
// WIRE <-> UI SHAPE
// ============================================================

/** API DTO -> the shape every product screen expects. */
export function toProduct(dto) {
  if (!dto) return null;

  const basePrice = Number(dto.basePrice ?? 0);
  const discountPercentage = Number(dto.discountPercentage ?? 0);

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    slug: dto.slug ?? "",
    description: dto.description ?? "",
    categoryId: dto.categoryId == null ? "" : String(dto.categoryId),
    subCategoryId: dto.subCategoryId == null ? "" : String(dto.subCategoryId),
    basePrice,
    discountPercentage,
    // `current_price` is written by the API from base price and
    // percentage; the fallback only matters for a row saved before that
    // column was populated.
    currentPrice: Number(
      dto.currentPrice ?? (basePrice * (100 - discountPercentage)) / 100,
    ),
    // Free-form { fabric, work, sleeve, ... } from the JSONB column.
    attributes: dto.attributes ?? {},
    isFeatured: Boolean(dto.isFeatured),
    active: Boolean(dto.active),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * Only the fields the create validator allows. An unknown key is a 400
 * ("Field ... is not allowed"), so this must not leak `id` or anything
 * else the form carries around.
 */
function toCreateBody(fields) {
  return {
    name: fields.name?.trim() ?? "",
    slug: fields.slug?.trim().toLowerCase() ?? "",
    description: fields.description?.trim() || null,
    categoryId: fields.categoryId,
    subCategoryId: fields.subCategoryId || null,
    basePrice: Number(fields.basePrice),
    discountPercentage: Number(fields.discountPercentage) || 0,
    attributes: fields.attributes ?? {},
    isFeatured: Boolean(fields.isFeatured),
    active: fields.active ?? true,
  };
}

/**
 * The update validator rejects a body with no known field, and silently
 * ignores `categoryId` — so that one is filtered out here and applied
 * separately by `updateProduct`.
 */
function toUpdateBody(patch) {
  const body = {};

  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.slug !== undefined) body.slug = patch.slug.trim().toLowerCase();
  if (patch.description !== undefined)
    body.description = patch.description?.trim() || null;
  if (patch.subCategoryId !== undefined)
    body.subCategoryId = patch.subCategoryId || null;
  if (patch.basePrice !== undefined) body.basePrice = Number(patch.basePrice);
  if (patch.discountPercentage !== undefined)
    body.discountPercentage = Number(patch.discountPercentage) || 0;
  if (patch.attributes !== undefined) body.attributes = patch.attributes ?? {};
  if (patch.isFeatured !== undefined) body.isFeatured = Boolean(patch.isFeatured);
  if (patch.active !== undefined) body.active = Boolean(patch.active);

  return body;
}

// ============================================================
// REFERENCE DATA
// ============================================================

function toSubCategory(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    name: dto.name ?? "",
    categoryId: dto.categoryId == null ? "" : String(dto.categoryId),
    active: Boolean(dto.isActive),
  };
}

/**
 * Sub-categories, all of them. `page` on this endpoint is an offset,
 * not a page number (see SubCategoryController.getAll).
 */
export async function listSubCategories({ token, signal } = {}) {
  const rows = [];

  for (let offset = 0; ; offset += MAX_PAGE_SIZE) {
    const { data } = await api.get(
      `/subCategories/getAllSubCategories?limit=${MAX_PAGE_SIZE}&page=${offset}`,
      { token, signal, envelope: true },
    );

    rows.push(...(data ?? []).map(toSubCategory));

    if (!data?.length || data.length < MAX_PAGE_SIZE) break;
  }

  return rows;
}

/**
 * Everything the product forms need besides products themselves: the
 * categories a product can belong to and their sub-categories.
 *
 * Sub-categories are optional on a product, so their endpoint failing
 * degrades to an empty list rather than blocking the form.
 *
 * @returns {Promise<{categories: Array, subCategories: Array}>}
 */
export async function getReference({ token, signal } = {}) {
  const [categoryResult, subCategories] = await Promise.all([
    listCategories({ token, signal }),
    listSubCategories({ token, signal }).catch(() => []),
  ]);

  return { categories: categoryResult.categories, subCategories };
}

// ============================================================
// READ
// ============================================================

/**
 * Every product, walked page by page. Capped at `maxPages` so a large
 * catalogue degrades into an undercount rather than a stalled screen.
 */
export async function listAllProducts({ maxPages = 20, token, signal } = {}) {
  const rows = [];

  for (let page = 1; page <= maxPages; page++) {
    const { data, meta } = await api.get(
      `/products/getAllProducts?page=${page}&limit=${MAX_PAGE_SIZE}`,
      { token, signal, envelope: true },
    );

    rows.push(...(data ?? []).map(toProduct));

    const totalPages = meta?.pagination?.totalPages ?? meta?.pagination?.pages;
    if (!data?.length || (totalPages && page >= totalPages)) break;
  }

  return rows;
}

const COMPARATORS = {
  newest: (a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0),
  oldest: (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0),
  name_asc: (a, b) => a.name.localeCompare(b.name),
  name_desc: (a, b) => b.name.localeCompare(a.name),
  price_asc: (a, b) => a.currentPrice - b.currentPrice,
  price_desc: (a, b) => b.currentPrice - a.currentPrice,
  discount_desc: (a, b) => b.discountPercentage - a.discountPercentage,
};

/** Header counters — computed over the whole catalogue, not one page. */
function statsFor(rows) {
  return {
    total: rows.length,
    active: rows.filter((p) => p.active).length,
    inactive: rows.filter((p) => !p.active).length,
    discounted: rows.filter((p) => p.discountPercentage > 0).length,
    featured: rows.filter((p) => p.isFeatured).length,
  };
}

/**
 * The admin list, filtered and sorted.
 *
 * The catalogue is fetched whole and narrowed here rather than pushed
 * into query params, because the API filters only by category and
 * active flag — a server-side page could not answer "matching the
 * search term" or "biggest offer first" correctly.
 *
 * `page` is 1-based and clamped, so a page left dangling by a filter
 * change or a deletion falls back to the last real page instead of
 * rendering empty.
 *
 * @returns {Promise<{rows: Array, matched: number, total: number,
 *                    limit: number, page: number, pages: number,
 *                    stats: object}>}
 */
export async function listProducts(query = {}, { token, signal } = {}) {
  const {
    search = "",
    categoryId = "all",
    status = "all", // all | active | inactive
    discount = "all", // all | discounted | full_price
    featured = "all", // all | featured | not_featured
    sort = "newest",
    page = 1,
  } = query;

  const all = await listAllProducts({ token, signal });
  const term = search.trim().toLowerCase();

  let rows = all;

  if (term) {
    rows = rows.filter((p) =>
      `${p.name} ${p.slug} ${p.description} ${Object.values(p.attributes ?? {}).join(" ")}`
        .toLowerCase()
        .includes(term),
    );
  }

  if (categoryId !== "all") {
    rows = rows.filter((p) => p.categoryId === String(categoryId));
  }

  if (status !== "all") {
    rows = rows.filter((p) => p.active === (status === "active"));
  }

  if (discount !== "all") {
    rows = rows.filter((p) =>
      discount === "discounted"
        ? p.discountPercentage > 0
        : p.discountPercentage === 0,
    );
  }

  if (featured !== "all") {
    rows = rows.filter((p) => p.isFeatured === (featured === "featured"));
  }

  rows = [...rows].sort(COMPARATORS[sort] ?? COMPARATORS.newest);

  const matched = rows.length;
  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);
  const start = (current - 1) * PAGE_SIZE;

  return {
    rows: rows.slice(start, start + PAGE_SIZE),
    matched,
    total: all.length,
    limit: PAGE_SIZE,
    page: current,
    pages,
    stats: statsFor(all),
  };
}

export async function getProduct(id, { token, signal } = {}) {
  const data = await api.get(
    `/products/getProductById/${encodeURIComponent(id)}`,
    { token, signal },
  );

  return toProduct(data);
}

// ============================================================
// WRITE
// ============================================================

export async function createProduct(fields, { token } = {}) {
  const data = await api.post(
    "/products/createProduct",
    toCreateBody(fields),
    { token },
  );

  return toProduct(data);
}

/**
 * Saves a product, including a category move.
 *
 * `PUT /products/updateProduct/:id` cannot change `category_id` — the
 * validator drops the key and the repository never writes the column —
 * so a changed category is applied through the bulk reassignment
 * endpoint and the row is re-read to return one authoritative product.
 *
 * @param {string} id
 * @param {object} patch  any subset of the product fields, plus an
 *                        optional `categoryId`
 * @param {object} [options]
 * @param {string} [options.currentCategoryId]  skips the extra request
 *                                              when the category is
 *                                              unchanged
 */
export async function updateProduct(
  id,
  patch,
  { currentCategoryId, token } = {},
) {
  const { categoryId, ...fields } = patch;
  const body = toUpdateBody(fields);

  let product = null;

  if (Object.keys(body).length) {
    product = toProduct(
      await api.put(`/products/updateProduct/${encodeURIComponent(id)}`, body, {
        token,
      }),
    );
  }

  const movingCategory =
    categoryId && categoryId !== (currentCategoryId ?? product?.categoryId);

  if (movingCategory) {
    await assignProductsToCategory(categoryId, [id], { token });
    return getProduct(id, { token });
  }

  return product ?? getProduct(id, { token });
}

/**
 * Moves products into a category. There is no inverse: `category_id` is
 * NOT NULL on products, so a product is always in exactly one category
 * and unlinking means linking somewhere else.
 */
export async function assignProductsToCategory(
  categoryId,
  productIds,
  { token } = {},
) {
  if (!productIds?.length) return 0;

  const data = await api.post(
    "/products/bulkUpdateCategory",
    { categoryId, productIds },
    { token },
  );

  return data?.updatedCount ?? productIds.length;
}

/**
 * Creates many products in one category in a single request — shared
 * category, one row per product.
 *
 * @param {string} categoryId
 * @param {Array<object>} rows  name, slug, description, basePrice,
 *                              discountPercentage, isFeatured, active
 */
export async function bulkCreateProducts(categoryId, rows, { token } = {}) {
  const data = await api.post(
    "/products/bulkCreateProducts",
    {
      categoryId,
      products: rows.map((row) => {
        // categoryId is shared and passed once, at the top level.
        const { categoryId: _ignored, ...fields } = toCreateBody({
          ...row,
          categoryId,
        });
        return fields;
      }),
    },
    { token },
  );

  return (data ?? []).map(toProduct);
}

// ============================================================
// MULTI-ROW ACTIONS
// ============================================================

/**
 * Runs one request per id and separates the failures, so a partial
 * outcome is reported instead of a single opaque error.
 *
 * @returns {Promise<{done: string[], failed: Array<{id, error}>}>}
 */
async function fanOut(ids, work) {
  const settled = await Promise.allSettled(ids.map((id) => work(id)));

  const done = [];
  const failed = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") done.push(ids[index]);
    else failed.push({ id: ids[index], error: result.reason });
  });

  return { done, failed };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Storefront visibility. Inactive products stay in the catalogue and on
 * past orders; they are simply invisible to shoppers.
 */
export async function setActive({ productIds = [], active }, { token } = {}) {
  const { done, failed } = await fanOut(productIds, (id) =>
    api.patch(
      `/products/updateProductStatus/${encodeURIComponent(id)}`,
      { active },
      { token },
    ),
  );

  if (!done.length && failed.length) throw failed[0].error;

  return {
    count: done.length,
    failed,
    message: `${active ? "Activated" : "Deactivated"} ${plural(done.length, "product")}${
      failed.length ? ` — ${failed.length} failed.` : "."
    }`,
  };
}

/** Percentage-based offer. Removing one is `percent = 0`. */
export async function applyDiscount(
  { productIds = [], percent },
  { token } = {},
) {
  const value = Number(percent);

  if (Number.isNaN(value) || value < 0 || value > 100) {
    throw new ApiError(
      "validation_failed",
      "Discount must be between 0 and 100.",
      { percent: "Enter a value between 0 and 100." },
      0,
    );
  }

  const { done, failed } = await fanOut(productIds, (id) =>
    api.put(
      `/products/updateProduct/${encodeURIComponent(id)}`,
      { discountPercentage: value },
      { token },
    ),
  );

  if (!done.length && failed.length) throw failed[0].error;

  return {
    percent: value,
    count: done.length,
    failed,
    message:
      value > 0
        ? `${value}% offer applied to ${plural(done.length, "product")}.`
        : `Offer removed from ${plural(done.length, "product")}.`,
  };
}

export function removeDiscount({ productIds = [] }, options) {
  return applyDiscount({ productIds, percent: 0 }, options);
}

/**
 * Permanent deletion. A product an order line points at is protected by
 * the foreign key, so the API refuses it — those rows come back in
 * `blocked` with the reason, and deactivating is the way to retire them.
 */
export async function deleteProducts(products = [], { token } = {}) {
  const ids = products.map((product) => product.id ?? product);

  const { done, failed } = await fanOut(ids, (id) =>
    api.del(`/products/deleteProduct/${encodeURIComponent(id)}`, { token }),
  );

  const labelOf = (id) =>
    products.find((product) => product.id === id)?.name ?? id;

  return {
    deleted: done.length,
    blocked: failed.map(({ id, error }) => ({
      id,
      label: labelOf(id),
      reason:
        error?.message ??
        "The API refused the delete — it is probably referenced elsewhere.",
    })),
  };
}
