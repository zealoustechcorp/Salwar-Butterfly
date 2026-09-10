// src/config/size_chart.policy.js
//
// The one definition of what a size chart may be (F-06).
//
// Mirrors review.policy.js and stock.policy.js: this module is what the
// validator and the service refuse on, and 014_create_size_charts.sql
// duplicates the same bounds as CHECK constraints so a value nobody
// defined cannot reach the table through psql either.
//
// The vocabulary below is the reason this file exists rather than the
// rules living in the validator. A chart's `columns` are keys, not
// labels — the storefront prints "Bust" for `bust` from its own map, and
// the admin editor offers the same list. An admin who could invent a
// column key would get a table with a blank heading on the shop's own
// product page, so the set is closed at both ends and named here.

/**
 * Every measurement a chart may have a column for.
 *
 * `size` is not in this list because it is not a measurement — it is the
 * row's name, it is always the first column, and it is the only one
 * whose values are text. See COLUMNS below.
 */
export const MEASUREMENT_KEYS = [
  "bust",
  "chest",
  "waist",
  "hip",
  "shoulder",
  "sleeve",
  "length",
  "inseam",
];

/** Every key a chart's `columns` array may contain, `size` first. */
export const COLUMN_KEYS = ["size", ...MEASUREMENT_KEYS];

/**
 * What a chart's numbers describe.
 *
 * The two published charts differ on exactly this, and it is not
 * cosmetic: a shopper reads a body chart against themselves and a
 * garment chart against the piece laid flat. A chart that does not say
 * which it is is a chart that will be read the wrong way round.
 */
export const MEASURES = ["body", "garment"];

export const DEFAULT_MEASURES = "body";

/** The shop publishes in inches; centimetres exist for a chart that is not. */
export const UNITS = ["in", "cm"];

export const DEFAULT_UNIT = "in";

// ============================================================
// BOUNDS
// ============================================================

/** Matches fit VARCHAR(60). */
export const MAX_FIT_LENGTH = 60;

/** Matches title VARCHAR(160). */
export const MAX_TITLE_LENGTH = 160;

/** Matches the size label inside a row — see the CHECK in 014. */
export const MAX_SIZE_LABEL_LENGTH = 20;

/** `size` plus at least one measurement, or the table says nothing. */
export const MIN_COLUMNS = 2;

export const MAX_COLUMNS = COLUMN_KEYS.length;

export const MIN_ROWS = 1;

/**
 * A size ladder, not a spreadsheet. The longest chart the shop prints
 * has nine rows; forty leaves room for a numeric ladder (36–46 in ones)
 * without leaving room for a paste accident.
 */
export const MAX_ROWS = 40;

/**
 * A measurement in inches or centimetres.
 *
 * The floor is above zero because a zero-inch bust is not a measurement,
 * and the ceiling is generous enough for centimetres on the largest
 * garment the shop cuts.
 */
export const MIN_MEASUREMENT = 1;

export const MAX_MEASUREMENT = 400;

/**
 * Half-inch steps are real — the slim chart's shoulder runs 14, 14.5,
 * 15. Anything finer than a tenth is a number nobody measures a garment
 * to, and rounding it here keeps the printed table from growing a column
 * of 15.499999.
 */
export const MEASUREMENT_DECIMALS = 1;

export const roundMeasurement = (value) =>
  Number(Number(value).toFixed(MEASUREMENT_DECIMALS));
