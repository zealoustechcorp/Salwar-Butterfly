/**
 * How the storefront reads a size chart (F-06).
 *
 * The charts themselves are no longer here. They live in the database —
 * `size_charts`, seeded from this file's own tables in
 * backend/src/migrations/014_create_size_charts.sql — and reach the
 * storefront through `lib/store/sizeCharts.js`, so a row corrected on
 * the shop's printed card is a row an admin edits rather than a
 * deployment.
 *
 * What stayed behind is everything that is not a chart:
 *
 *   - The column labels, because the API stores column *keys* and only
 *     the storefront knows what to print over them.
 *   - The pant length, which no chart has a column for: it does not vary
 *     by size, so it is a property of the garment rather than a row.
 *   - The shop's standing guidance on reading a chart.
 *   - One copy of the two published charts, as a fallback for a fetch
 *     that failed. See FALLBACK_SIZE_CHARTS.
 */

// --- units and columns ------------------------------------------------------

/** What a chart is measured in when it does not say. Every seeded chart is inches. */
export const SIZE_UNIT = "in";

/**
 * The heading printed over each column key.
 *
 * The API stores keys — `bust`, not "Bust" — and the set of them is
 * closed at the other end by backend/src/config/size_chart.policy.js.
 * These two lists have to agree: a key with no entry here renders a
 * blank heading over real measurements, which is why `columnLabel`
 * falls back to the key itself rather than to an empty string.
 */
export const COLUMN_LABEL = {
  size: "Size",
  bust: "Bust",
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  shoulder: "Shoulder",
  sleeve: "Sleeve",
  length: "Length",
  inseam: "Inseam",
};

/**
 * @param {string} key
 * @returns {string} The shop's heading for a column, or the key itself
 *          if the API has grown one this build has never heard of.
 */
export function columnLabel(key) {
  return COLUMN_LABEL[key] ?? key;
}

/**
 * What a chart's numbers describe — the distinction the shop's two
 * charts turn on, so it is printed above each table rather than buried
 * in the footnotes.
 */
export const MEASURES_NOTE = {
  body: "Your own measurements. Measure yourself and read across.",
  garment:
    "The outfit laid flat, not your body. Measure yourself, then match a garment to it.",
};

// --- the fallback charts ----------------------------------------------------

/**
 * The two charts the shop published when they lived in this file.
 *
 * Kept for exactly one case: the size-chart request failed and the page
 * still has a shopper on it choosing a size. These are the same numbers
 * the migration seeded, so serving them is serving a chart that was true
 * — and a size picker with no chart beside it is a shopper guessing.
 *
 * They are **not** used when the API answers with an empty list. That is
 * a real answer, meaning the shop has withdrawn its charts, and
 * overriding it with a copy the shop cannot edit would be the storefront
 * publishing measurements on its own authority.
 *
 * Every number is in inches and is transcribed from the shop's printed
 * cards. Nothing here is derived, interpolated or rounded — a row that
 * looks inconsistent with its neighbours is the shop's chart.
 */
export const FALLBACK_SIZE_CHARTS = [
  {
    fit: "Normal Fit",
    title: "Normal fit — salwars and co-ord sets",
    measures: "body",
    unit: "in",
    columns: ["size", "bust", "waist", "hip"],
    // The size labels are the shop's own and are deliberately
    // inconsistent past XL ("XXL", then "3X", "4X", then "5XL").
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
  },
  {
    fit: "Slim Fit",
    title: "Slim fit — salwars",
    measures: "garment",
    unit: "in",
    columns: ["size", "bust", "waist", "hip", "shoulder"],
    rows: [
      { size: "S", bust: 36, waist: 34, hip: 39, shoulder: 14 },
      { size: "M", bust: 38, waist: 36, hip: 41, shoulder: 14.5 },
      { size: "L", bust: 40, waist: 38, hip: 43, shoulder: 15 },
      { size: "XL", bust: 42, waist: 40, hip: 45, shoulder: 15.5 },
      { size: "2XL", bust: 44, waist: 42, hip: 47, shoulder: 16 },
      { size: "3XL", bust: 46, waist: 44, hip: 49, shoulder: 16.5 },
    ],
  },
];

// --- pant length ------------------------------------------------------------

/**
 * Pant length, which no chart has a column for.
 *
 * It does not vary by size — the shop cuts one length per garment type
 * and alters on request — so it is a property of the garment rather than
 * a row, and it stays here rather than moving into the database with the
 * charts. Salwars are given as a range because the shop states one.
 */
export const PANT_LENGTH = {
  salwar: { min: 38, max: 39, label: "38–39 in" },
  coord_set: { min: 36, max: 36, label: "36 in" },
};

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

// --- guidance ---------------------------------------------------------------

/**
 * How to read the charts — the shop's own guidance, printed beside them.
 *
 * Kept as data rather than JSX so the same words can appear on a product
 * page, in a size-guide page and in a modal without drifting apart. Not
 * in the database with the charts: this is standing copy about sizing in
 * general, not a property of any one fit.
 */
export const SIZING_NOTES = [
  "Garment measurements are the outfit laid flat, not your body — take your body measurements and match the garment to them.",
  "Garments have little to no margin.",
  "On the borderline between two sizes, the smaller one is a tighter fit and the larger a relaxed one. The larger can always be altered; the smaller cannot.",
];

// --- reading a chart --------------------------------------------------------

/**
 * A cell, as the table prints it.
 *
 * A blank measurement comes back from the API as null and is printed as
 * a dash. It must not become a zero: zero is a measurement, and no
 * garment has a nought-inch shoulder.
 *
 * @param {number | null | undefined} value
 * @returns {string}
 */
export function measurement(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/**
 * The chart for a fit, by name.
 *
 * Returns null rather than a nearest match when the shop publishes no
 * chart for that fit — a gown sized off a salwar table is worse than no
 * table.
 *
 * @param {Array<object>} charts
 * @param {string} fit
 */
export function sizeChartFor(charts, fit) {
  return charts?.find((chart) => chart.fit === fit) ?? null;
}
