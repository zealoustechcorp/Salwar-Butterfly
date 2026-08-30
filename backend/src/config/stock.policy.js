// src/config/stock.policy.js
//
// The one definition of what a stock number means (F-04).
//
// Two thresholds, and they are the whole rule:
//
//   out of stock   0 units — actually none, not "nearly none", so every
//                  unit the shop holds stays sellable.
//   low stock      1 to 9 units. This is F-04.05's "order fast" warning.
//
// The FRS quotes 20 and 10 as examples. 10 is taken as the low-stock
// line; out-of-stock stays at a true zero rather than the spec's
// suggested reserve buffer, because this catalogue stocks one or two
// pieces per size — holding back the last ten would take every product
// in the shop off sale.
//
// Read by the variant mapper and the inventory read model, and mirrored
// on the client in frontend/src/lib/stock.js. Changing a number here
// moves the admin badge and the storefront message together, which is
// the reason it is a module and not two constants in two files.

/** A quantity at or below this is out of stock. */
export const OUT_OF_STOCK_AT = 0;

/** A quantity below this — and above OUT_OF_STOCK_AT — is low. */
export const LOW_STOCK_BELOW = 10;

/**
 * The largest stock a single size may hold.
 *
 * Not a business rule so much as a typo guard: a boutique holding one
 * or two pieces per size has no legitimate 900,000, and a stray keypress
 * should be refused rather than stored. Matches the ceiling
 * ProductVariantService already enforces on the product form.
 */
export const MAX_STOCK = 1_000_000;

export const STOCK_STATUS = {
  IN_STOCK: "in_stock",
  LOW_STOCK: "low_stock",
  OUT_OF_STOCK: "out_of_stock",
  /** Deactivated: the size exists and may hold stock, but is not on sale. */
  UNAVAILABLE: "unavailable",
};

/**
 * The status of one quantity.
 *
 * `active` comes first because a deactivated size is unavailable
 * whatever its count — the shop has taken it off sale, and reporting it
 * as "in stock" would put it back on the storefront.
 */
export const stockStatusForQuantity = (quantity, active = true) => {
  if (!active) return STOCK_STATUS.UNAVAILABLE;

  const units = Number(quantity) || 0;

  if (units <= OUT_OF_STOCK_AT) return STOCK_STATUS.OUT_OF_STOCK;
  if (units < LOW_STOCK_BELOW) return STOCK_STATUS.LOW_STOCK;

  return STOCK_STATUS.IN_STOCK;
};

/** The same rule, over a `product_variants` row. */
export const stockStatusFor = (variant) =>
  stockStatusForQuantity(variant?.stock_quantity, variant?.active);

/**
 * The worst status in a set — what a product shows when its sizes
 * disagree. A product with one sold-out size is not simply "in stock",
 * and saying so is how a shopper ends up on a size chip they cannot buy.
 *
 * Deactivated sizes are ignored: they are not on sale, so they cannot
 * drag down the status of the sizes that are.
 */
export const worstStatusOf = (variants = []) => {
  const active = variants.filter((variant) => variant.active);

  if (active.length === 0) return STOCK_STATUS.UNAVAILABLE;

  const statuses = active.map((variant) => stockStatusFor(variant));

  if (statuses.includes(STOCK_STATUS.OUT_OF_STOCK)) {
    return STOCK_STATUS.OUT_OF_STOCK;
  }

  if (statuses.includes(STOCK_STATUS.LOW_STOCK)) {
    return STOCK_STATUS.LOW_STOCK;
  }

  return STOCK_STATUS.IN_STOCK;
};

/**
 * SQL predicates for each status, for filtering in the database rather
 * than after the fact.
 *
 * The inventory screen paginates, so the filter has to run in the query:
 * fetching a page and then dropping the rows that do not match would
 * hand back short pages and a total that counts rows the admin cannot
 * see. `alias` is the table alias the caller used for product_variants.
 *
 * Thresholds are inlined rather than parameterised because they are
 * module constants, never user input.
 */
export const stockStatusSql = (status, alias = "v") => {
  switch (status) {
    case STOCK_STATUS.UNAVAILABLE:
      return `${alias}.active = FALSE`;

    case STOCK_STATUS.OUT_OF_STOCK:
      return `${alias}.active = TRUE AND ${alias}.stock_quantity <= ${OUT_OF_STOCK_AT}`;

    case STOCK_STATUS.LOW_STOCK:
      return `${alias}.active = TRUE AND ${alias}.stock_quantity > ${OUT_OF_STOCK_AT} AND ${alias}.stock_quantity < ${LOW_STOCK_BELOW}`;

    case STOCK_STATUS.IN_STOCK:
      return `${alias}.active = TRUE AND ${alias}.stock_quantity >= ${LOW_STOCK_BELOW}`;

    default:
      return null;
  }
};

/**
 * The same four cases as one CASE expression, so a query can select the
 * status alongside the row and sort or group by it.
 */
export const stockStatusCaseSql = (alias = "v") => `
  CASE
    WHEN ${alias}.active = FALSE THEN '${STOCK_STATUS.UNAVAILABLE}'
    WHEN ${alias}.stock_quantity <= ${OUT_OF_STOCK_AT} THEN '${STOCK_STATUS.OUT_OF_STOCK}'
    WHEN ${alias}.stock_quantity < ${LOW_STOCK_BELOW} THEN '${STOCK_STATUS.LOW_STOCK}'
    ELSE '${STOCK_STATUS.IN_STOCK}'
  END
`;

/** Every status the API will accept as a filter. */
export const STOCK_STATUSES = Object.values(STOCK_STATUS);
