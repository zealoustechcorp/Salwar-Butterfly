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

/** Matches the thresholds in the API's variant mapper. */
export const STOCK_LABEL = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  unavailable: "Unavailable",
};

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
