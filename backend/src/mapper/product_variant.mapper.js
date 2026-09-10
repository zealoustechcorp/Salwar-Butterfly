/**
 * Stock thresholds are presentation rules, not columns — the admin and
 * the storefront must agree on when a size counts as "low", so the
 * status is derived once, in src/config/stock.policy.js, rather than in
 * each screen. Re-exported here so existing importers keep working.
 */
import { stockStatusFor, worstStatusOf } from "../config/stock.policy.js";

export { stockStatusFor };

/**
 * The column stores '' for "not sold by colour" (migration 015). Clients
 * get null instead, so nothing outside the repository layer has to know
 * the sentinel exists — and `if (variant.colour)` reads correctly either
 * way.
 */
const colourOf = (row) => {
  const colour = typeof row?.colour === "string" ? row.colour.trim() : "";
  return colour === "" ? null : colour;
};

export const ProductVariantMapper = {
  toDTO(variant) {
    if (!variant) return null;

    return {
      id: variant.id,
      productId: variant.product_id,
      size: variant.size,
      colour: colourOf(variant),
      // Joined from the approved-values register, not stored on the
      // variant: a colour renamed or re-toned in the register must not
      // leave every variant carrying a stale swatch. Null when the
      // colour is unregistered or has no hex recorded — the client falls
      // back to a name chip.
      colourHex: variant.colour_hex ?? null,
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
      colour: row.colour ?? "",
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
   * The per-product roll-up the list and detail screens show: how many
   * sellable rows, how many colourways, how many units, and the worst
   * status among them.
   *
   * `sizeCount` still counts variant rows rather than distinct sizes, so
   * a product in four sizes and two colours reports eight — that is the
   * number of things the shop counts stock against, and the number the
   * inventory screen shows. `colours` is listed separately for the
   * screens that want to say "in 2 colours" instead.
   */
  toSummary(variants = []) {
    const active = variants.filter((v) => v.active);

    // Distinct, in first-seen order, so the list reads in the order the
    // admin arranged the variants rather than alphabetically.
    const colours = [];
    for (const variant of variants) {
      const colour = colourOf(variant);
      if (colour && !colours.includes(colour)) colours.push(colour);
    }

    return {
      sizeCount: variants.length,
      activeSizeCount: active.length,
      colourCount: colours.length,
      colours,
      totalStock: active.reduce((sum, v) => sum + Number(v.stock_quantity), 0),
      lowestStatus: worstStatusOf(variants),
    };
  },
};
