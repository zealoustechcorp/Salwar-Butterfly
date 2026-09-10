"use client";

/**
 * @file SizeChartEditor.js
 * @description Interactive Size Chart Measurement Matrix Editor.
 * Provides an editable tabular interface where administrators can customize garment measurements
 * (in centimetres) for each fit variant (e.g. Slim Fit, Normal Fit, Special Dress).
 * 
 * Features:
 * - Direct cell value editing for Size, Chest, Waist, Hip, and Length.
 * - Dynamic row deletion and addition.
 * - Monospace typography and clean tabular layout.
 */

import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input } from "@/components/admin/ui";
import { validateMeasurementText, validateSizeLabel } from "@/lib/validate";

/**
 * The measurement columns, and the row header that names them.
 *
 * Exported because CategoryForm checks the same grid before it saves, and
 * two lists of column keys would drift the moment one gains a column.
 */
export const CHART_COLUMNS = ["size", "chest", "waist", "hip", "length"];

/**
 * What is wrong with one cell of a category size chart, or null.
 *
 * These cells are free text rather than `type="number"`, and deliberately:
 * the shop is transcribing a printed card that says "80–84", and a numeric
 * input cannot hold a range. That freedom is also why they need checking —
 * nothing stopped "-5" or "0" going into the `fits` column, which the API
 * stores as opaque JSON and the storefront prints verbatim.
 *
 * Exported for the same reason as CHART_COLUMNS.
 */
export function chartCellProblem(rows, rowIndex, column) {
  const row = rows[rowIndex];
  const value = String(row?.[column] ?? "").trim();

  if (column !== "size") return validateMeasurementText(value, "Measurement");

  // A blank row the shop has just added is not yet wrong. The save says so.
  if (!value) return null;

  const duplicated = rows.some(
    (other, index) =>
      index !== rowIndex &&
      String(other?.size ?? "").trim().toLowerCase() === value.toLowerCase(),
  );

  if (duplicated) return "This size is listed twice";

  return validateSizeLabel(value, "This size label");
}

/**
 * The whole grid, as one sentence naming the first cell at fault.
 *
 * @returns {string|null}
 */
export function chartProblem(chart) {
  const rows = chart?.rows ?? [];

  if (rows.length === 0) return `${chart?.fit ?? "That fit"} has no size rows`;

  for (let index = 0; index < rows.length; index += 1) {
    if (!String(rows[index]?.size ?? "").trim()) {
      return `${chart.fit}, row ${index + 1}: a size label is required`;
    }

    for (const column of CHART_COLUMNS) {
      const problem = chartCellProblem(rows, index, column);

      if (problem) {
        return `${chart.fit}, row ${index + 1} (${rows[index].size}): ${column} — ${problem}`;
      }
    }
  }

  return null;
}

/**
 * SizeChartEditor Component
 *
 * @param {Object} props - Component properties
 * @param {Object} props.chart - Size chart object containing `fit` and an array of `rows`
 * @param {string} props.chart.fit - Name of the garment fit variant (e.g., "Slim Fit")
 * @param {Array<Object>} props.chart.rows - Array of size measurement objects
 * @param {Function} props.onChange - Callback function receiving updated chart object
 * @returns {JSX.Element} The rendered size chart table editor
 */
export default function SizeChartEditor({ chart, onChange }) {
  /**
   * Standard column keys representing garment measurement dimensions.
   */
  const cols = CHART_COLUMNS;

  /**
   * Updates a single cell's measurement value in the chart matrix.
   *
   * @param {number} rowIdx - Zero-based index of the target row in `chart.rows`
   * @param {string} col - Column property being modified ('size' | 'chest' | 'waist' | 'hip' | 'length')
   * @param {string} val - New string value entered by administrator (e.g. "88–92")
   */
  const updateCell = (rowIdx, col, val) => {
    onChange({
      ...chart,
      rows: chart.rows.map((r, i) => (i === rowIdx ? { ...r, [col]: val } : r)),
    });
  };

  /**
   * Removes a measurement row from the size chart.
   *
   * @param {number} rowIdx - Zero-based index of the row to remove
   */
  const removeRow = (rowIdx) => {
    onChange({
      ...chart,
      rows: chart.rows.filter((_, idx) => idx !== rowIdx),
    });
  };

  /**
   * Appends an empty measurement row to the bottom of the size chart matrix.
   */
  const addRow = () => {
    onChange({
      ...chart,
      rows: [...chart.rows, { size: "", chest: "", waist: "", hip: "", length: "" }],
    });
  };

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-ink-200/80 shadow-xs mb-4">
      {/* 
        ========================================================================
        CHART HEADER
        Displays fit name badge and measurement unit declaration (centimetres).
        ========================================================================
      */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge tone="brand" className="font-semibold">
            {chart.fit}
          </Badge>
          <span className="text-xs text-ink-500">Size chart measurements</span>
        </div>
        <span className="font-mono text-[11px] font-medium text-ink-400">Unit: cm</span>
      </div>

      {/* 
        ========================================================================
        MEASUREMENT DATA TABLE
        Interactive inputs for size labels and dimensions (Chest, Waist, Hip, Length).
        ========================================================================
      */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/40">
              {cols.map((c) => (
                <th
                  key={c}
                  className="px-3 py-2 font-mono text-[11px] font-semibold tracking-wider text-ink-600 uppercase"
                >
                  {c}
                </th>
              ))}
              <th className="w-10 px-2 py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {chart.rows.map((row, i) => (
              <tr key={i} className="hover:bg-ink-50/50 transition-colors">
                {cols.map((col) => {
                  const problem = chartCellProblem(chart.rows, i, col);

                  return (
                    <td key={col} className="p-1.5">
                      <Input
                        value={row[col]}
                        onChange={(e) => updateCell(i, col, e.target.value)}
                        placeholder={col === "size" ? "40" : "80–84"}
                        maxLength={col === "size" ? 20 : 40}
                        invalid={Boolean(problem)}
                        aria-invalid={Boolean(problem) || undefined}
                        // No room for a message under every cell in a grid
                        // this dense, so the reason rides the input. Saving
                        // the category says the same thing in a sentence.
                        title={problem ?? undefined}
                        className={`h-8 text-xs font-mono ${col === "size" ? "font-semibold text-ink-900 bg-ink-50/40" : ""
                          }`}
                      />
                    </td>
                  );
                })}
                {/* Row deletion button */}
                <td className="p-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="inline-flex size-7 items-center justify-center rounded text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Remove row"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 
        ========================================================================
        ADD ROW FOOTER
        Dashed button to append a new blank size measurement row.
        ========================================================================
      */}
      <div className="border-t border-ink-200/80 bg-ink-50/30 p-2.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={addRow}
          className="w-full border-dashed"
        >
          <Plus className="size-3.5" />
          Add size row
        </Button>
      </div>
    </div>
  );
}

