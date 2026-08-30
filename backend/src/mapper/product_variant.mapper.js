/**
 * Stock thresholds are presentation rules, not columns — the admin and
 * the storefront must agree on when a size counts as "low", so the
 * status is derived once, in src/config/stock.policy.js, rather than in
 * each screen. Re-exported here so existing importers keep working.
 */
import { stockStatusFor, worstStatusOf } from "../config/stock.policy.js";

export { stockStatusFor };

export const ProductVariantMapper = {
  toDTO(variant) {
    if (!variant) return null;

    return {
      id: variant.id,
      productId: variant.product_id,
      size: variant.size,
      stockQuantity: Number(variant.stock_quantity),
      active: variant.active,
      position: Number(variant.position ?? 0),
      stockStatus: stockStatusFor(variant),
      createdAt: variant.created_at,
      updatedAt: variant.updated_at,
    };
  },

  toDTOList(variants = []) {
    return variants.map((variant) => ProductVariantMapper.toDTO(variant));
  },

  toEntity(row) {
    if (!row) return null;

    return {
      id: row.id,
      product_id: row.product_id,
      size: row.size,
      stock_quantity: row.stock_quantity,
      active: row.active,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  toEntityList(rows = []) {
    return rows.map((row) => ProductVariantMapper.toEntity(row));
  },

  /**
   * The per-product roll-up the list and detail screens show:
   * how many sizes, how many units, and the worst status among them.
   */
  toSummary(variants = []) {
    const active = variants.filter((v) => v.active);

    return {
      sizeCount: variants.length,
      activeSizeCount: active.length,
      totalStock: active.reduce((sum, v) => sum + Number(v.stock_quantity), 0),
      lowestStatus: worstStatusOf(variants),
    };
  },
};
