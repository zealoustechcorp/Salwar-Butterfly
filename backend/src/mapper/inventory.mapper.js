// src/mapper/inventory.mapper.js

import {
  LOW_STOCK_BELOW,
  OUT_OF_STOCK_AT,
  STOCK_STATUS,
  STOCK_STATUSES,
} from "../config/stock.policy.js";

/**
 * An inventory line: one size of one product, with enough of that
 * product attached to be actionable without a second request.
 *
 * The product context is nested rather than flattened onto the row, so
 * a client can pass `row.product` straight to a product tile instead of
 * unpicking a dozen `product`-prefixed keys.
 */
export const InventoryMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      productId: row.product_id,
      size: row.size,
      stockQuantity: Number(row.stock_quantity),
      active: row.active,
      position: Number(row.position ?? 0),

      // Computed by the same rule the storefront will show, in SQL, so
      // filtering and display can never disagree about one row.
      stockStatus: row.stock_status,

      product: {
        id: row.product_id,
        name: row.product_name,
        slug: row.product_slug,
        active: row.product_active,
        price: row.product_price === null ? null : Number(row.product_price),
        imageUrl: row.product_image_url ?? null,
        categoryId: row.category_id ?? null,
        categoryName: row.category_name ?? null,
      },

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => InventoryMapper.toDTO(row));
  },

  /**
   * The stat tiles above the table.
   *
   * `products` counts are per status and therefore overlap — a product
   * with one sold-out size and two healthy ones is counted under both
   * out_of_stock and in_stock. That is the useful reading for "how many
   * products need attention"; it is not a partition, and summing the
   * four will exceed the catalogue size.
   */
  toSummary({ byStatus = [], productsWithoutSizes = 0 } = {}) {
    const blank = () => ({ sizes: 0, products: 0, units: 0 });

    const buckets = Object.fromEntries(
      STOCK_STATUSES.map((status) => [status, blank()]),
    );

    let totalUnits = 0;
    let totalSizes = 0;

    for (const row of byStatus) {
      const bucket = buckets[row.stock_status];
      if (!bucket) continue;

      bucket.sizes = Number(row.size_count) || 0;
      bucket.products = Number(row.product_count) || 0;
      bucket.units = Number(row.units) || 0;

      totalSizes += bucket.sizes;

      // Deactivated sizes hold stock the shop still owns, but it is not
      // on sale — counting it as stock on hand would overstate what the
      // storefront can actually sell.
      if (row.stock_status !== STOCK_STATUS.UNAVAILABLE) {
        totalUnits += bucket.units;
      }
    }

    return {
      totalUnits,
      totalSizes,
      inStock: buckets[STOCK_STATUS.IN_STOCK],
      lowStock: buckets[STOCK_STATUS.LOW_STOCK],
      outOfStock: buckets[STOCK_STATUS.OUT_OF_STOCK],
      unavailable: buckets[STOCK_STATUS.UNAVAILABLE],

      // Not a stock state — a product that was never given sizes. It
      // cannot be bought at any price, so it belongs on this screen even
      // though no variant row describes it.
      productsWithoutSizes: Number(productsWithoutSizes) || 0,

      // Echoed so a client never has to hardcode the same numbers to
      // render its "only N left" copy — retuning the policy retunes the
      // wording with it.
      thresholds: {
        outOfStockAt: OUT_OF_STOCK_AT,
        lowStockBelow: LOW_STOCK_BELOW,
      },
    };
  },
};
