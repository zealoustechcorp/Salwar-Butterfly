"use client";

/**
 * The editor for one published size chart (F-06).
 *
 * Controlled: it holds no state of its own and hands the whole chart back
 * on every keystroke, so the page above owns the draft, the save and the
 * "you have unsaved changes" question. The same component serves a new
 * fit and an edit — there is no difference between them worth branching
 * on, because the API's update is a full replace.
 *
 * Two things it enforces that the API would also refuse, but which are
 * better refused here where the shop can see why:
 *
 *   - `size` is a fixed first column. It is the row's name rather than a
 *     measurement, and a table whose first column is a hip measurement
 *     reads as a spreadsheet.
 *   - Turning a column off drops that key from every row. Leaving the
 *     values behind would store measurements the storefront never prints
 *     — the shop believing it published a shoulder column that nobody
 *     can see.
 *
 * A blank cell is left blank, never filled with a zero. It goes up as
 * null and the storefront prints a dash: "the shop states no shoulder
 * for this size" is a real thing to say, and zero is a measurement.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import {
  LIMITS,
  MEASUREMENT_KEYS,
  MEASURES_OPTIONS,
  UNIT_OPTIONS,
} from "@/lib/api/sizeCharts";
import { COLUMN_LABEL } from "@/lib/sizing";

import { Button, cx, Field, Input, Select } from "./ui";

/** A chart with nothing in it — what "Add a fit" opens on. */
export const BLANK_CHART = {
  fit: "",
  title: "",
  measures: "body",
  unit: "in",
  columns: ["size", "bust", "waist", "hip"],
  rows: [
    { size: "S", bust: null, waist: null, hip: null },
    { size: "M", bust: null, waist: null, hip: null },
    { size: "L", bust: null, waist: null, hip: null },
  ],
  active: true,
};

/** Moves an item within a list, or returns the list untouched at the ends. */
const move = (items, from, to) => {
  if (to < 0 || to >= items.length) return items;

  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);

  return next;
};

export default function SizeChartBuilder({ chart, onChange, errors = {} }) {
  const measurements = chart.columns.filter((column) => column !== "size");

  const patch = (fields) => onChange({ ...chart, ...fields });

  /**
   * Adds or removes a measurement column, and keeps every row in step.
   *
   * The column order follows MEASUREMENT_KEYS rather than the order the
   * shop happened to tick the boxes in, so two charts that measure the
   * same things print their columns the same way round.
   */
  const toggleColumn = (key) => {
    const on = measurements.includes(key);

    const nextMeasurements = on
      ? measurements.filter((column) => column !== key)
      : MEASUREMENT_KEYS.filter(
          (column) => column === key || measurements.includes(column),
        );

    patch({
      columns: ["size", ...nextMeasurements],
      rows: chart.rows.map((row) => {
        const next = { size: row.size };

        for (const column of nextMeasurements) {
          next[column] = row[column] ?? null;
        }

        return next;
      }),
    });
  };

  const updateCell = (index, column, value) =>
    patch({
      rows: chart.rows.map((row, i) =>
        i === index
          ? { ...row, [column]: column === "size" ? value : value === "" ? null : value }
          : row,
      ),
    });

  const addRow = () => {
    const blank = { size: "" };

    for (const column of measurements) blank[column] = null;

    patch({ rows: [...chart.rows, blank] });
  };

  const removeRow = (index) =>
    patch({ rows: chart.rows.filter((_, i) => i !== index) });

  const moveRow = (index, delta) =>
    patch({ rows: move(chart.rows, index, index + delta) });

  return (
    <div className="space-y-5">
      {/* ----------------------------------------------------------
          WHAT THE CHART IS
          ---------------------------------------------------------- */}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fit"
          required
          error={errors.fit}
          hint="What the storefront tab says — “Slim Fit”, “Normal Fit”."
        >
          <Input
            value={chart.fit}
            maxLength={LIMITS.fit}
            invalid={Boolean(errors.fit)}
            onChange={(e) => patch({ fit: e.target.value })}
            placeholder="Normal Fit"
          />
        </Field>

        <Field
          label="Title"
          required
          error={errors.title}
          hint="The heading over the table. Say which garments it covers."
        >
          <Input
            value={chart.title}
            maxLength={LIMITS.title}
            invalid={Boolean(errors.title)}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Normal fit — salwars and co-ord sets"
          />
        </Field>

        <Field
          label="What the numbers measure"
          required
          error={errors.measures}
          hint={
            MEASURES_OPTIONS.find((option) => option.value === chart.measures)?.hint
          }
        >
          <Select
            value={chart.measures}
            onChange={(e) => patch({ measures: e.target.value })}
          >
            {MEASURES_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Unit"
          error={errors.unit}
          hint="Printed in every column heading on the storefront."
        >
          <Select value={chart.unit} onChange={(e) => patch({ unit: e.target.value })}>
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ----------------------------------------------------------
          COLUMNS
          ----------------------------------------------------------
          Chips rather than a multi-select: the set is small, the
          shop picks two or three, and every one of them has to be
          readable at a glance against the table underneath. */}

      <div>
        <p className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold text-ink-700">
          Columns <span className="text-brand-600">*</span>
        </p>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex cursor-not-allowed items-center rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-500 ring-1 ring-inset ring-ink-200">
            Size — always first
          </span>

          {MEASUREMENT_KEYS.map((key) => {
            const on = measurements.includes(key);

            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleColumn(key)}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  on
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-ink-600 ring-ink-300 hover:bg-ink-50",
                )}
              >
                {COLUMN_LABEL[key]}
              </button>
            );
          })}
        </div>

        {errors.columns ? (
          <p className="mt-1 text-xs text-red-600">{errors.columns}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-500">
            Turning a column off clears it from every row below.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------------
          THE TABLE
          ----------------------------------------------------------
          Laid out as the storefront prints it, on purpose: this is
          the one screen where the shop is transcribing a printed
          card, and a form that does not look like the card is a
          form that gets a row out of order. */}

      <div className="overflow-hidden rounded-xl ring-1 ring-ink-200/80">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50/70 px-4 py-2.5">
          <span className="text-xs font-semibold text-ink-700">
            Size rows
            <span className="ml-1.5 font-normal text-ink-500">
              {chart.rows.length} of {LIMITS.rows}
            </span>
          </span>
          <span className="font-mono text-[11px] font-medium text-ink-400">
            Unit: {chart.unit}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/40">
                {chart.columns.map((column) => (
                  <th
                    key={column}
                    className="px-3 py-2 font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase"
                  >
                    {COLUMN_LABEL[column] ?? column}
                  </th>
                ))}
                <th className="w-24 px-2 py-2" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {chart.rows.map((row, index) => (
                // Keyed by position rather than by size label: the label is
                // what the shop is typing, so keying by it would remount the
                // input on every keystroke and lose the caret.
                <tr key={index} className="transition-colors hover:bg-ink-50/50">
                  {chart.columns.map((column) => (
                    <td key={column} className="p-1.5">
                      <Input
                        value={row[column] ?? ""}
                        inputMode={column === "size" ? "text" : "decimal"}
                        type={column === "size" ? "text" : "number"}
                        step={column === "size" ? undefined : "0.5"}
                        min={column === "size" ? undefined : LIMITS.measurement.min}
                        max={column === "size" ? undefined : LIMITS.measurement.max}
                        maxLength={column === "size" ? LIMITS.sizeLabel : undefined}
                        onChange={(e) => updateCell(index, column, e.target.value)}
                        placeholder={column === "size" ? "M" : "—"}
                        className={cx(
                          "h-8 font-mono text-xs",
                          column === "size" && "bg-ink-50/40 font-semibold text-ink-900",
                        )}
                      />
                    </td>
                  ))}

                  <td className="p-1.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveRow(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                        className="inline-flex size-7 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveRow(index, 1)}
                        disabled={index === chart.rows.length - 1}
                        title="Move down"
                        className="inline-flex size-7 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        title="Remove row"
                        className="inline-flex size-7 items-center justify-center rounded text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-ink-200/80 bg-ink-50/30 p-2.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={addRow}
            disabled={chart.rows.length >= LIMITS.rows}
            className="w-full border-dashed"
          >
            <Plus className="size-3.5" />
            Add size row
          </Button>
        </div>
      </div>

      {errors.rows ? <p className="text-xs text-red-600">{errors.rows}</p> : null}

      <p className="text-[11px] leading-relaxed text-ink-500">
        Leave a cell blank where the shop states no measurement for that size — the
        storefront prints a dash. Do not type 0: a shopper reads that as a measurement.
      </p>
    </div>
  );
}
