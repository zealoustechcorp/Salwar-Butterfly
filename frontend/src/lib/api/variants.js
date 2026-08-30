/**
 * Product variants — the sellable sizes, and the stock behind each one.
 *
 * A product is a listing; a variant is the row a shopper actually buys.
 * One row per (product, size), each with its own stock count, which is
 * why "S sold out, M has 12 left" is expressible at all.
 *
 * The product form edits a product's whole size set at once, so the
 * write path is `replaceVariants` — one transactional PUT rather than a
 * create/update/delete dance that can fail halfway and leave a product
 * with three of the four sizes the admin intended.
 */

import { api } from "./client";

/**
 * Re-exported so existing importers keep working. The labels — and the
 * thresholds behind them — are defined once in lib/stock.js.
 */
export { STOCK_LABEL } from "../stock";

/** The order sizes are offered in, and the order they are stored in. */
export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

const EMPTY_SUMMARY = {
  sizeCount: 0,
  activeSizeCount: 0,
  totalStock: 0,
  lowestStatus: "unavailable",
};

export function toVariant(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    productId: String(dto.productId),
    size: dto.size ?? "",
    stockQuantity: Number(dto.stockQuantity ?? 0),
    active: Boolean(dto.active),
    position: Number(dto.position ?? 0),
    // Derived by the API from its own thresholds, so the admin and the
    // storefront cannot disagree about what "low" means.
    stockStatus: dto.stockStatus ?? "unavailable",
  };
}

export { EMPTY_SUMMARY };

/**
 * One product's sizes.
 *
 * @returns {Promise<{variants: Array, summary: object}>}
 */
export async function getVariantsForProduct(productId, { token, signal } = {}) {
  const { data, meta } = await api.get(
    `/productVariants/getVariantsByProduct/${encodeURIComponent(productId)}`,
    { token, signal, envelope: true },
  );

  return {
    variants: (data ?? []).map(toVariant),
    summary: meta?.summary ?? EMPTY_SUMMARY,
  };
}

/**
 * Stock roll-ups for the whole catalogue, keyed by product id — the
 * product list shows a stock column per row and must not fire one
 * request per product.
 *
 * @returns {Promise<Record<string, object>>}
 */
export async function getVariantSummaries({ maxPages = 20, token, signal } = {}) {
  const summaries = {};

  for (let page = 1; page <= maxPages; page++) {
    const { meta } = await api.get(
      `/productVariants/getAllVariants?page=${page}&limit=500`,
      { token, signal, envelope: true },
    );

    Object.assign(summaries, meta?.summaries ?? {});

    const pagination = meta?.pagination;
    if (!pagination || page >= (pagination.totalPages ?? 1)) break;
  }

  return summaries;
}

/**
 * Makes a product's sizes exactly match `variants`, in one transaction.
 *
 * A size left out of the list is deleted along with its stock count, so
 * callers should confirm before dropping one that still holds stock.
 *
 * @param {string} productId
 * @param {Array<{size: string, stockQuantity: number, active?: boolean}>} variants
 *        order matters — it is stored and replayed on read
 */
export async function replaceVariants(productId, variants, { token } = {}) {
  const { data, meta } = await api.put(
    `/productVariants/replaceProductVariants/${encodeURIComponent(productId)}`,
    {
      variants: variants.map((variant) => ({
        size: variant.size,
        stockQuantity: Number(variant.stockQuantity) || 0,
        active: variant.active ?? true,
      })),
    },
    { token, envelope: true },
  );

  return {
    variants: (data ?? []).map(toVariant),
    summary: meta?.summary ?? EMPTY_SUMMARY,
  };
}

/** Single-field stock edit, for the inline control on the detail screen. */
export async function updateVariantStock(variantId, stockQuantity, { token } = {}) {
  const data = await api.patch(
    `/productVariants/updateVariantStock/${encodeURIComponent(variantId)}`,
    { stockQuantity: Number(stockQuantity) || 0 },
    { token },
  );

  return toVariant(data);
}

// ============================================================
// MULTI-SELECT  (F-03.11)
// ============================================================

/**
 * Takes several sizes off sale, or puts them back.
 *
 * The reversible half of the pair: a deactivated size keeps its stock
 * count and its history and simply stops being offered. This is what
 * retiring a size means — deleting is for one entered by mistake.
 *
 * @param {string[]} variantIds
 * @param {boolean} active
 */
export async function bulkSetVariantActive(variantIds, active, { token } = {}) {
  const { data, meta } = await api.patch(
    "/productVariants/bulkSetVariantActive",
    { variantIds, active },
    { token, envelope: true },
  );

  return {
    variants: (data ?? []).map(toVariant),
    count: meta?.count ?? (data ?? []).length,
    missing: meta?.missing ?? 0,
  };
}

/**
 * Deletes several sizes.
 *
 * A size still holding stock comes back in `blocked` rather than being
 * removed — deleting a variant destroys the only record of that stock.
 * Everything else in the selection is still deleted, so one protected
 * size does not block the other nine. Pass `force` to delete them
 * anyway, once the screen has said what will be lost.
 *
 * @returns {Promise<{deleted: number, blocked: Array<{id, label, reason}>,
 *                    emptiedProducts: Array<{id, name, slug}>, missing: number}>}
 *          `emptiedProducts` are the products this left with no sizes at
 *          all — not refused, but nothing can be bought in them.
 */
export async function bulkDeleteVariants(variantIds, { force = false, token } = {}) {
  const data = await api.del("/productVariants/bulkDeleteVariants", {
    body: { variantIds, force },
    token,
  });

  return {
    deleted: data?.deleted ?? 0,
    blocked: data?.blocked ?? [],
    emptiedProducts: data?.emptiedProducts ?? [],
    missing: data?.missing ?? 0,
  };
}
