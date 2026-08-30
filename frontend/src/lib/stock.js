/**
 * What a stock number means, on the client (F-04).
 *
 * This mirrors backend/src/config/stock.policy.js. The API is the
 * authority — every row it returns already carries a `stockStatus` it
 * derived itself, and screens should render that rather than recompute
 * it. What lives here is for the two cases the API cannot cover:
 *
 *   - the storefront, which still renders from the committed snapshot
 *     in lib/store/catalogue.js and has no `stockStatus` to read;
 *   - a form editing stock that has not been saved yet, where there is
 *     no server round trip to ask.
 *
 * Keep the two numbers below in step with the policy module. They are
 * duplicated rather than fetched because a badge cannot wait on a
 * request to know what colour it is.
 */

/** A quantity at or below this is out of stock. */
export const OUT_OF_STOCK_AT = 0;

/** A quantity below this — and above OUT_OF_STOCK_AT — is low. */
export const LOW_STOCK_BELOW = 10;

export const STOCK_STATUS = {
  IN_STOCK: "in_stock",
  LOW_STOCK: "low_stock",
  OUT_OF_STOCK: "out_of_stock",
  UNAVAILABLE: "unavailable",
};

/** Admin wording — precise about what the shop holds. */
export const STOCK_LABEL = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  unavailable: "Not on sale",
};

/** Badge colours, so a status looks the same on every screen. */
export const STOCK_TONE = {
  in_stock: "green",
  low_stock: "amber",
  out_of_stock: "red",
  unavailable: "slate",
};

export function stockStatusFor(quantity, active = true) {
  if (!active) return STOCK_STATUS.UNAVAILABLE;

  const units = Number(quantity) || 0;

  if (units <= OUT_OF_STOCK_AT) return STOCK_STATUS.OUT_OF_STOCK;
  if (units < LOW_STOCK_BELOW) return STOCK_STATUS.LOW_STOCK;

  return STOCK_STATUS.IN_STOCK;
}

/**
 * The worst status across a set of sizes — what a product shows when
 * its sizes disagree. Deactivated sizes are ignored: they are not on
 * sale, so they cannot drag down the ones that are.
 */
export function worstStatusOf(sizes = []) {
  const active = sizes.filter((size) => size.active !== false);

  if (active.length === 0) return STOCK_STATUS.UNAVAILABLE;

  const statuses = active.map((size) =>
    stockStatusFor(size.stock ?? size.stockQuantity, true),
  );

  if (statuses.includes(STOCK_STATUS.OUT_OF_STOCK)) return STOCK_STATUS.OUT_OF_STOCK;
  if (statuses.includes(STOCK_STATUS.LOW_STOCK)) return STOCK_STATUS.LOW_STOCK;

  return STOCK_STATUS.IN_STOCK;
}

/**
 * What the shopper is told (F-04.05).
 *
 * An exact count rather than a band, because this shop stocks one or
 * two pieces of a print: with the low-stock line at 10, a generic
 * "Low stock" chip would sit on essentially every product in the
 * catalogue and stop meaning anything. "Only 2 left" says the same
 * thing, is true, and is worth reading.
 *
 * @returns {{tone: string, text: string, urgent: boolean}|null}
 *          null when there is nothing worth saying — a healthy size
 *          needs no notice.
 */
export function availabilityNotice(quantity, active = true) {
  const status = stockStatusFor(quantity, active);
  const units = Number(quantity) || 0;

  if (status === STOCK_STATUS.UNAVAILABLE) {
    return { tone: "slate", text: "Unavailable", urgent: false };
  }

  if (status === STOCK_STATUS.OUT_OF_STOCK) {
    return { tone: "red", text: "Sold out", urgent: false };
  }

  if (status === STOCK_STATUS.LOW_STOCK) {
    return {
      tone: "amber",
      text: units === 1 ? "Only 1 left" : `Only ${units} left`,
      urgent: true,
    };
  }

  return null;
}
