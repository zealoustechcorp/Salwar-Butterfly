/**
 * The shop's published size charts, verbatim (F-06).
 *
 * These are static on purpose. Categories carry a `fits` JSONB column an
 * admin can fill with charts (see lib/categories/utils.js), but the
 * storefront read model — backend/src/mapper/storefront.mapper.js — does
 * not project it, so a shopper on a product page has nothing to read. The
 * shop publishes exactly two charts for its whole catalogue, so copying
 * them here is honest rather than lossy: there is no per-category chart
 * being flattened, only one pair of tables that has never varied.
 *
 * Every number below is in **inches** and is transcribed from the charts
 * the shop hands out. Nothing here is derived, interpolated or rounded —
 * if a row looks inconsistent with its neighbours, that is the shop's
 * chart, and changing it here would be inventing measurements for a real
 * garment someone is about to buy.
 *
 * The two charts do not measure the same thing, which is why they are not
 * merged and why each carries its own `measures` note:
 *
 *   - Normal Fit is a **body** chart. A shopper measures themselves and
 *     reads across.
 *   - Slim Fit is a **garment** chart — the piece laid flat. A shopper
 *     measures themselves and then matches a garment to that, which is
 *     the instruction the shop prints beneath it.
 */

/** Units for every measurement in this file. */
export const SIZE_UNIT = "in";

/**
 * Normal Fit — normal-fit salwars and co-ord sets.
 *
 * Body measurements, XS through 5XL. The size labels are the shop's own
 * and are deliberately inconsistent past XL ("XXL", then "3X", "4X",
 * then "5XL"); they are kept as printed so a shopper comparing this
 * table against the shop's card sees the same words.
 */
export const NORMAL_FIT_CHART = {
  fit: "Normal Fit",
  title: "Normal fit — salwars and co-ord sets",
  measures: "body",
  columns: ["size", "bust", "waist", "hip"],
  rows: [
    { size: "XS", bust: 34, waist: 28, hip: 36 },
    { size: "S", bust: 36, waist: 30, hip: 38 },
    { size: "M", bust: 38, waist: 32, hip: 40 },
    { size: "L", bust: 40, waist: 34, hip: 42 },
    { size: "XL", bust: 42, waist: 36, hip: 44 },
    { size: "XXL", bust: 44, waist: 38, hip: 46 },
    { size: "3X", bust: 46, waist: 40, hip: 48 },
    { size: "4X", bust: 48, waist: 42, hip: 50 },
    { size: "5XL", bust: 50, waist: 44, hip: 52 },
  ],
};

/**
 * Slim Fit — slim-fit salwars.
 *
 * Garment measurements, S through 3XL, with a shoulder column the body
 * chart has no equivalent for. The shop's chart shows one further row
 * above S that is redacted on the copy it circulates; it is omitted here
 * rather than guessed at.
 */
export const SLIM_FIT_CHART = {
  fit: "Slim Fit",
  title: "Slim fit — salwars",
  measures: "garment",
  columns: ["size", "bust", "waist", "hip", "shoulder"],
  rows: [
    { size: "S", bust: 36, waist: 34, hip: 39, shoulder: 14 },
    { size: "M", bust: 38, waist: 36, hip: 41, shoulder: 14.5 },
    { size: "L", bust: 40, waist: 38, hip: 43, shoulder: 15 },
    { size: "XL", bust: 42, waist: 40, hip: 45, shoulder: 15.5 },
    { size: "2XL", bust: 44, waist: 42, hip: 47, shoulder: 16 },
    { size: "3XL", bust: 46, waist: 44, hip: 49, shoulder: 16.5 },
  ],
};

/** Both charts, in the order the shop prints them. */
export const SIZE_CHARTS = [NORMAL_FIT_CHART, SLIM_FIT_CHART];

/**
 * Pant length, which neither chart has a column for.
 *
 * It does not vary by size — the shop cuts one length per garment type
 * and alters on request — so it is a property of the garment, not a row.
 * Salwars are given as a range because the shop states one.
 */
export const PANT_LENGTH = {
  salwar: { min: 38, max: 39, label: "38–39 in" },
  coord_set: { min: 36, max: 36, label: "36 in" },
};

/**
 * How to read the charts — the shop's own guidance, printed beside them.
 *
 * Kept as data rather than JSX so the same words can appear on a product
 * page, in a size-guide page and in a modal without drifting apart.
 */
export const SIZING_NOTES = [
  "All measurements are in inches.",
  "Garment measurements are the outfit laid flat, not your body — take your body measurements and match the garment to them.",
  "Garments have little to no margin.",
  "On the borderline between two sizes, the smaller one is a tighter fit and the larger a relaxed one. The larger can always be altered; the smaller cannot.",
];

/**
 * The chart for a fit, by the same names lib/categories/constants.js uses.
 *
 * "Special Dress" is a real fit in that enum but the shop publishes no
 * chart for it, so this returns null rather than a misleading fallback —
 * a gown sized off a salwar table is worse than no table.
 *
 * @param {string} fit - "Normal Fit", "Slim Fit", or anything else.
 * @returns {typeof NORMAL_FIT_CHART | null}
 */
export function sizeChartFor(fit) {
  return SIZE_CHARTS.find((chart) => chart.fit === fit) ?? null;
}

/**
 * The pant length for a garment type.
 *
 * @param {"salwar" | "coord_set"} garment
 * @returns {string | null} A display label, or null for a garment the
 *          shop states no length for (a kurti, a dupatta).
 */
export function pantLengthFor(garment) {
  return PANT_LENGTH[garment]?.label ?? null;
}

/**
 * The garment type a storefront collection is cut as.
 *
 * The read model carries no garment field, and the shop's five live
 * collections are named by cut — "Straight cut salwars", "Aline salwars",
 * "Anarkali salwars", "Coord sets", "Western wears" — so the name is the
 * only thing there is to read. This only decides which PANT_LENGTH entry
 * applies; anything the two tests below do not recognise, "Western wears"
 * included, returns null and is shown no length rather than a salwar's.
 *
 * @param {string | null | undefined} categoryName
 * @returns {"salwar" | "coord_set" | null}
 */
export function garmentForCategory(categoryName) {
  if (!categoryName) return null;
  if (/co-?ord/i.test(categoryName)) return "coord_set";
  if (/salwar/i.test(categoryName)) return "salwar";
  return null;
}
