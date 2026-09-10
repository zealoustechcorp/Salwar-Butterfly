/**
 * The shop's published size charts (F-06), admin side.
 *
 * These are the tables a shopper reads next to a Buy button. They were
 * two hardcoded objects in `lib/sizing.js` until the `size_charts` table
 * was created and seeded from them, so what this module edits is the
 * shop's own printed cards rather than a new idea about sizing.
 *
 * Two things about the API worth knowing before calling it:
 *
 *   - `updateSizeChart` is a **replace**, not a patch. Send the whole
 *     chart. There is no partial update of a measurement grid that means
 *     anything — dropping a column and clearing it are different edits
 *     and a patch could not tell them apart.
 *   - `columns` is a list of *keys*, and the set is closed at the API.
 *     `COLUMN_KEYS` below is this side's copy of it; the storefront
 *     prints a heading per key from `COLUMN_LABEL` in `lib/sizing.js`.
 *
 * Errors are the `ApiError` thrown by the shared client.
 */

import { COLUMN_LABEL } from "@/lib/sizing";

import { api } from "./client";

/**
 * Every column a chart may have, `size` first.
 *
 * Taken from the label map so that a key this build cannot print a
 * heading for is a key it cannot offer either. Mirrors
 * backend/src/config/size_chart.policy.js; the API refuses anything else.
 */
export const COLUMN_KEYS = Object.keys(COLUMN_LABEL);

/** The measurement columns — everything but the row header. */
export const MEASUREMENT_KEYS = COLUMN_KEYS.filter((key) => key !== "size");

export const MEASURES_OPTIONS = [
  {
    value: "body",
    label: "Body measurements",
    hint: "The shopper measures themselves and reads across.",
  },
  {
    value: "garment",
    label: "Garment measurements",
    hint: "The piece laid flat. The shopper measures themselves, then matches a garment to it.",
  },
];

export const UNIT_OPTIONS = [
  { value: "in", label: "Inches (in)" },
  { value: "cm", label: "Centimetres (cm)" },
];

/** What the API refuses past, so the editor can refuse first. */
export const LIMITS = {
  fit: 60,
  title: 160,
  sizeLabel: 20,
  rows: 40,
  measurement: { min: 1, max: 400 },
};

/**
 * One chart.
 *
 * The rows are left exactly as the API sent them — objects keyed by
 * column, with null for a blank cell. Nothing here fills a gap or
 * rounds: these are measurements for a real garment, and the editor
 * shows the shop what the shop typed.
 */
export function toSizeChart(dto) {
  if (!dto) return null;

  return {
    id: String(dto.id),
    fit: dto.fit ?? "",
    title: dto.title ?? "",
    measures: dto.measures ?? "body",
    unit: dto.unit ?? "in",
    columns: Array.isArray(dto.columns) ? dto.columns : [],
    rows: Array.isArray(dto.rows) ? dto.rows : [],
    position: Number(dto.position ?? 0),
    active: Boolean(dto.active),
    createdAt: dto.createdAt ?? null,
    updatedAt: dto.updatedAt ?? null,
  };
}

/**
 * The body both writes send.
 *
 * A blank cell goes up as null rather than being dropped: the API stores
 * null and the storefront prints a dash, which is the shop saying "no
 * measurement for this size" instead of the column quietly disappearing.
 */
function toBody(chart) {
  const columns = chart.columns;

  return {
    fit: String(chart.fit ?? "").trim(),
    title: String(chart.title ?? "").trim(),
    measures: chart.measures,
    unit: chart.unit,
    columns,
    rows: chart.rows.map((row) => {
      const out = { size: String(row.size ?? "").trim() };

      for (const column of columns.slice(1)) {
        const value = row[column];

        out[column] =
          value === null || value === undefined || value === ""
            ? null
            : Number(value);
      }

      return out;
    }),
    ...(chart.active === undefined ? {} : { active: Boolean(chart.active) }),
  };
}

/** Every chart, published or not, in the order the shop prints them. */
export async function listSizeCharts({ token, signal } = {}) {
  const data = await api.get("/sizeCharts/getSizeCharts", { token, signal });

  return (data ?? []).map(toSizeChart);
}

/**
 * The fits the shop cuts — the product form's Fit picker.
 *
 * A fit exists because a chart is published for it, so this is that list
 * and there is no second register behind it. Charts the shop has taken
 * down are dropped: a withdrawn chart is a fit that should not be put on
 * a new product, while a product already carrying it keeps it (the form
 * shows the stored value regardless — see AttributeFields).
 *
 * The whole chart is read to get a handful of strings, and that is fine:
 * the table holds a few rows and the admin panel loads it on the size
 * charts screen anyway.
 *
 * @returns {Promise<Array<{fit: string, title: string}>>} in print order
 */
export async function listFits({ token, signal } = {}) {
  const charts = await listSizeCharts({ token, signal });

  return charts
    .filter((chart) => chart.active && chart.fit)
    .map((chart) => ({ fit: chart.fit, title: chart.title }));
}

export async function getSizeChart(id, { token, signal } = {}) {
  const data = await api.get(
    `/sizeCharts/getSizeChartById/${encodeURIComponent(id)}`,
    { token, signal },
  );

  return toSizeChart(data);
}

/** A new fit. It lands last in the print order; reorder to move it. */
export async function createSizeChart(chart, { token } = {}) {
  const data = await api.post("/sizeCharts/createSizeChart", toBody(chart), {
    token,
  });

  return toSizeChart(data);
}

/** A full replace — see the module header. */
export async function updateSizeChart(id, chart, { token } = {}) {
  const data = await api.put(
    `/sizeCharts/updateSizeChart/${encodeURIComponent(id)}`,
    toBody(chart),
    { token },
  );

  return toSizeChart(data);
}

/** Takes a chart off the storefront, or puts it back. */
export async function setSizeChartActive(id, active, { token } = {}) {
  const data = await api.patch(
    `/sizeCharts/setSizeChartActive/${encodeURIComponent(id)}`,
    { active: Boolean(active) },
    { token },
  );

  return toSizeChart(data);
}

/**
 * The order the charts print in, which is the order of the tabs a
 * shopper sees.
 *
 * Takes every chart's id. The API refuses a partial list rather than
 * half-applying it, so the caller must send the whole set — which also
 * means a screen that has gone stale is told so instead of silently
 * renumbering charts somebody else added.
 */
export async function reorderSizeCharts(ids, { token } = {}) {
  const data = await api.patch(
    "/sizeCharts/reorderSizeCharts",
    { ids },
    { token },
  );

  return (data ?? []).map(toSizeChart);
}

/**
 * Deletes a chart outright.
 *
 * There is no undo. Hiding is what `setSizeChartActive` is for, and it
 * is the gesture the table offers first. Returns what is left.
 */
export async function deleteSizeChart(id, { token } = {}) {
  const data = await api.del(
    `/sizeCharts/deleteSizeChart/${encodeURIComponent(id)}`,
    { token },
  );

  return (data ?? []).map(toSizeChart);
}
