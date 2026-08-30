/**
 * Stock thresholds. These are presentation rules, not columns — the
 * admin and the storefront must agree on when a size counts as "low",
 * so the status is derived once, here, rather than in each screen.
 */
const OUT_OF_STOCK_AT = 0;
const LOW_STOCK_AT = 5;

export const stockStatusFor = (variant) => {
  if (!variant.active) return "unavailable";
  if (variant.stock_quantity <= OUT_OF_STOCK_AT) return "out_of_stock";
  if (variant.stock_quantity <= LOW_STOCK_AT) return "low_stock";
  return "in_stock";
};

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
    const statuses = active.map((v) => stockStatusFor(v));

    return {
      sizeCount: variants.length,
      activeSizeCount: active.length,
      totalStock: active.reduce((sum, v) => sum + Number(v.stock_quantity), 0),
      lowestStatus: statuses.includes("out_of_stock")
        ? "out_of_stock"
        : statuses.includes("low_stock")
          ? "low_stock"
          : active.length
            ? "in_stock"
            : "unavailable",
    };
  },
};
