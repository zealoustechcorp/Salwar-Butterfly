/**
 * Inventory (F-04) — stock across the whole catalogue.
 *
 * The variants client next door answers "what sizes does this product
 * have?". This one answers the opposite question — "what, anywhere in
 * the shop, is running out?" — which is why it is variant-first with
 * the product attached, rather than the other way round.
 *
 * Two kinds of write, and the difference matters:
 *
 *   adjustStock   a movement: +2 arrived, -1 was damaged. Sent as a
 *                 delta, so two people counting the same delivery both
 *                 land instead of the second overwriting the first.
 *
 *   setStock      a stock-take: an absolute count. Send the figure the
 *                 screen was showing as `expected` and the write is
 *                 refused if the row moved in the meantime, rather than
 *                 silently discarding whatever changed.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { api } from "./client";

export const STOCK_SORTS = [
  { value: "stock_asc", label: "Lowest stock first" },
  { value: "stock_desc", label: "Highest stock first" },
  { value: "product", label: "Product A–Z" },
  { value: "updated", label: "Recently updated" },
];

export const EMPTY_SUMMARY = {
  totalUnits: 0,
  totalSizes: 0,
  inStock: { sizes: 0, products: 0, units: 0 },
  lowStock: { sizes: 0, products: 0, units: 0 },
  outOfStock: { sizes: 0, products: 0, units: 0 },
  unavailable: { sizes: 0, products: 0, units: 0 },
  productsWithoutSizes: 0,
  thresholds: { outOfStockAt: 0, lowStockBelow: 10 },
};

/**
 * One inventory line.
 *
 * The product's photo is reshaped into the `primaryImage` that
 * <ProductCover> already expects, so the stock table reuses the same
 * thumbnail component as every other product screen.
 */
export function toInventoryLine(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    productId: String(dto.productId),
    size: dto.size ?? "",
    stockQuantity: Number(dto.stockQuantity ?? 0),
    active: Boolean(dto.active),
    position: Number(dto.position ?? 0),

    // Derived by the API from the one policy module, so the table, its
    // filters and the storefront cannot disagree about one row.
    stockStatus: dto.stockStatus ?? "unavailable",

    product: {
      id: String(dto.product?.id ?? dto.productId),
      name: dto.product?.name ?? "",
      slug: dto.product?.slug ?? "",
      active: Boolean(dto.product?.active),
      price: dto.product?.price == null ? null : Number(dto.product.price),
      categoryId: dto.product?.categoryId ?? null,
      categoryName: dto.product?.categoryName ?? null,
      primaryImage: dto.product?.imageUrl
        ? { url: dto.product.imageUrl, altText: dto.product?.name ?? "" }
        : null,
    },

    updatedAt: dto.updatedAt ?? null,
  };
}

function buildQuery({ status, search, categoryId, productId, sort, page, limit }) {
  const params = new URLSearchParams();

  if (status && status !== "all") params.set("status", status);
  if (search) params.set("search", search);
  if (categoryId && categoryId !== "all") params.set("categoryId", categoryId);
  if (productId) params.set("productId", productId);
  if (sort) params.set("sort", sort);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A page of stock lines, with the catalogue-wide totals beside it.
 *
 * The totals describe every row there is, not the fifty on this page —
 * they come from their own query for exactly that reason.
 *
 * @returns {Promise<{rows: Array, summary: object, pagination: object}>}
 */
export async function listInventory(query = {}, { token, signal } = {}) {
  const { data, meta } = await api.get(`/inventory/getInventory${buildQuery(query)}`, {
    token,
    signal,
    envelope: true,
  });

  return {
    rows: (data ?? []).map(toInventoryLine),
    summary: meta?.summary ?? EMPTY_SUMMARY,
    pagination: meta?.pagination ?? {
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

/** The totals on their own — for a screen with no table to show. */
export async function getInventorySummary({ categoryId, token, signal } = {}) {
  const data = await api.get(
    `/inventory/getInventorySummary${categoryId && categoryId !== "all" ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`,
    { token, signal },
  );

  return data ?? EMPTY_SUMMARY;
}

/**
 * Moves one size's stock by `delta`.
 *
 * @param {number} delta  positive or negative, never zero
 */
export async function adjustStock(variantId, delta, { token } = {}) {
  const data = await api.patch(
    `/inventory/adjustStock/${encodeURIComponent(variantId)}`,
    { delta: Number(delta) },
    { token },
  );

  return toInventoryLine(data);
}

/**
 * Sets one size's stock to a counted figure.
 *
 * @param {number|null} expected  what the screen was showing; omit only
 *                                when there is genuinely nothing to
 *                                conflict with
 */
export async function setStock(variantId, stockQuantity, expected = null, { token } = {}) {
  const data = await api.patch(
    `/inventory/setStock/${encodeURIComponent(variantId)}`,
    {
      stockQuantity: Number(stockQuantity),
      ...(expected === null || expected === undefined
        ? {}
        : { expectedStockQuantity: Number(expected) }),
    },
    { token },
  );

  return toInventoryLine(data);
}

/**
 * Several movements as one transaction — a delivery arriving.
 *
 * All of it applies or none does: a half-applied delivery cannot be
 * told apart from a whole one by looking, which would mean re-counting
 * the lot.
 *
 * @param {Array<{variantId: string, delta: number}>} adjustments
 */
export async function bulkAdjustStock(adjustments, { token } = {}) {
  const data = await api.put(
    "/inventory/bulkAdjustStock",
    {
      adjustments: adjustments.map((adjustment) => ({
        variantId: adjustment.variantId,
        delta: Number(adjustment.delta),
      })),
    },
    { token },
  );

  return (data ?? []).map(toInventoryLine);
}
