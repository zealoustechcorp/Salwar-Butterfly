// src/validators/size_chart.rules.js
//
// Field rules for a size chart (F-06).
//
// Shape only, as everywhere in this directory: each function returns a
// message or null, and the validator middleware assembles them into the
// `errors` map an ApiError carries. What a chart may *contain* — which
// measurement keys exist, how many rows, what counts as a measurement —
// is config/size_chart.policy.js, so this file and the CHECK constraints
// in 014 are both quoting one source.
//
// The table itself is checked properly rather than waved through as
// "must be an object". A chart is printed straight onto a product page
// next to a Buy button; a row missing its bust column is a shopper
// guessing, and it costs nothing to refuse it here.

import {
  COLUMN_KEYS,
  MAX_COLUMNS,
  MAX_FIT_LENGTH,
  MAX_MEASUREMENT,
  MAX_ROWS,
  MAX_SIZE_LABEL_LENGTH,
  MAX_TITLE_LENGTH,
  MEASURES,
  MIN_COLUMNS,
  MIN_MEASUREMENT,
  MIN_ROWS,
  UNITS,
} from "../config/size_chart.policy.js";

const list = (values) => values.join(", ");

export const validateFit = (value, required = true) => {
  if (value === undefined || value === null || value === "") {
    return required ? "A fit name is required" : null;
  }

  if (typeof value !== "string") return "Fit must be a string";

  const fit = value.trim();

  if (!fit) return "Fit cannot be empty";
  if (fit.length < 2) return "Fit must be at least 2 characters";
  if (fit.length > MAX_FIT_LENGTH) {
    return `Fit must not exceed ${MAX_FIT_LENGTH} characters`;
  }

  return null;
};

export const validateTitle = (value, required = true) => {
  if (value === undefined || value === null || value === "") {
    return required ? "A title is required" : null;
  }

  if (typeof value !== "string") return "Title must be a string";

  const title = value.trim();

  if (!title) return "Title cannot be empty";
  if (title.length > MAX_TITLE_LENGTH) {
    return `Title must not exceed ${MAX_TITLE_LENGTH} characters`;
  }

  return null;
};

export const validateMeasures = (value, required = true) => {
  if (value === undefined || value === null || value === "") {
    return required ? "Say whether the chart measures a body or a garment" : null;
  }

  if (!MEASURES.includes(value)) {
    return `Measures must be one of: ${list(MEASURES)}`;
  }

  return null;
};

export const validateUnit = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (!UNITS.includes(value)) {
    return `Unit must be one of: ${list(UNITS)}`;
  }

  return null;
};

/**
 * The chart's columns.
 *
 * `size` must be first and must be present. It is the row header rather
 * than a measurement — it is what every other cell in the row is *about*
 * — and a table whose first column is a hip measurement reads as a
 * spreadsheet rather than a size chart.
 */
export const validateColumns = (value, required = true) => {
  if (value === undefined || value === null) {
    return required ? "A chart needs its columns" : null;
  }

  if (!Array.isArray(value)) return "Columns must be an array";

  if (value.length < MIN_COLUMNS) {
    return `A chart needs at least ${MIN_COLUMNS} columns: size, and something to measure`;
  }

  if (value.length > MAX_COLUMNS) {
    return `A chart may have at most ${MAX_COLUMNS} columns`;
  }

  if (value[0] !== "size") {
    return "The first column must be 'size'";
  }

  const seen = new Set();

  for (const column of value) {
    if (typeof column !== "string" || !COLUMN_KEYS.includes(column)) {
      return `Unknown column '${column}'. Allowed: ${list(COLUMN_KEYS)}`;
    }

    if (seen.has(column)) return `Column '${column}' is listed twice`;

    seen.add(column);
  }

  return null;
};

/**
 * One measurement cell.
 *
 * null and "" are accepted and mean "the shop states none for this
 * size" — the storefront prints a dash. Zero is refused: it is a number
 * a shopper would read as a measurement, and no garment has a nought-inch
 * anything.
 */
const validateMeasurement = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number)) return "must be a number";

  if (number < MIN_MEASUREMENT || number > MAX_MEASUREMENT) {
    return `must be between ${MIN_MEASUREMENT} and ${MAX_MEASUREMENT}`;
  }

  return null;
};

/**
 * The chart's rows, against the columns they are meant to fill.
 *
 * Checked as a pair rather than separately, because neither is
 * meaningful alone: a row is valid only in terms of the columns the
 * table declares, and the error worth returning is "row 3 has no waist",
 * which requires both.
 *
 * @param {unknown} value    the rows
 * @param {string[]} columns the already-validated column list
 */
export const validateRows = (value, columns, required = true) => {
  if (value === undefined || value === null) {
    return required ? "A chart needs at least one size row" : null;
  }

  if (!Array.isArray(value)) return "Rows must be an array";

  if (value.length < MIN_ROWS) return "A chart needs at least one size row";

  if (value.length > MAX_ROWS) {
    return `A chart may have at most ${MAX_ROWS} size rows`;
  }

  // Columns failed their own check; saying "row 1 has no bust" against a
  // column list that is itself wrong would be two errors for one cause.
  if (!Array.isArray(columns) || columns[0] !== "size") return null;

  const measurements = columns.slice(1);
  const labels = new Set();

  for (const [index, row] of value.entries()) {
    const where = `Row ${index + 1}`;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${where} must be an object`;
    }

    const size = typeof row.size === "string" ? row.size.trim() : "";

    if (!size) return `${where} needs a size label`;

    if (size.length > MAX_SIZE_LABEL_LENGTH) {
      return `${where}: a size label must not exceed ${MAX_SIZE_LABEL_LENGTH} characters`;
    }

    // Two rows called "L" is a table a shopper cannot read across, and
    // the storefront keys its rows by size when it renders them.
    const key = size.toLowerCase();

    if (labels.has(key)) return `${where}: '${size}' is listed twice`;

    labels.add(key);

    for (const column of measurements) {
      const problem = validateMeasurement(row[column]);

      if (problem) return `${where} (${size}): ${column} ${problem}`;
    }

    // A key the columns do not declare would be stored and never
    // printed — a measurement the shop believes it published and no
    // shopper can see.
    for (const field of Object.keys(row)) {
      if (!columns.includes(field)) {
        return `${where} (${size}): '${field}' is not one of this chart's columns`;
      }
    }
  }

  return null;
};

export const validatePosition = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const position = Number(value);

  if (!Number.isInteger(position) || position < 0) {
    return "Position must be a whole number, 0 or more";
  }

  return null;
};

export const validateActive = (value) => {
  if (value === undefined || value === null) return null;

  if (typeof value !== "boolean") return "Active must be true or false";

  return null;
};

/**
 * A whole chart body — what create and replace both send.
 *
 * Returns a map of field → message, empty when the body is good.
 */
export const validateSizeChartFields = (body = {}) => {
  const errors = {};

  const fit = validateFit(body.fit);
  if (fit) errors.fit = fit;

  const title = validateTitle(body.title);
  if (title) errors.title = title;

  const measures = validateMeasures(body.measures);
  if (measures) errors.measures = measures;

  const unit = validateUnit(body.unit);
  if (unit) errors.unit = unit;

  const columns = validateColumns(body.columns);
  if (columns) errors.columns = columns;

  const rows = validateRows(body.rows, body.columns);
  if (rows) errors.rows = rows;

  const position = validatePosition(body.position);
  if (position) errors.position = position;

  const active = validateActive(body.active);
  if (active) errors.active = active;

  return errors;
};
