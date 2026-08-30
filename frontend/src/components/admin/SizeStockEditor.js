"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { STANDARD_SIZES } from "@/lib/api/variants";
import { number } from "@/lib/format";
import { Badge, Button, cx, Input, Toggle } from "./ui";

/**
 * A product's sellable sizes and the stock behind each.
 *
 * Sizes are picked as chips — tapping one adds or removes it — because
 * the common case is a standard run (S–XL) and typing four rows by hand
 * for every product is the kind of friction that makes a catalogue go
 * un-entered. Anything non-standard ("38", "Free Size") is added
 * through the free-text field.
 *
 * The row order is what gets stored, so sizes always read back in the
 * order shown here rather than alphabetically (where L precedes M
 * precedes S, which looks broken).
 *
 * Shape held by the parent:
 *   [{ size: "M", stockQuantity: 12, active: true }, ...]
 */
export function SizeStockEditor({ rows, onChange, disabled = false }) {
  const [custom, setCustom] = useState("");

  const chosen = new Set(rows.map((row) => row.size));

  function toggleSize(size) {
    if (chosen.has(size)) {
      onChange(rows.filter((row) => row.size !== size));
      return;
    }

    // Keep the standard run in its natural order however the chips are
    // clicked; anything custom stays where it was appended.
    const next = [...rows, { size, stockQuantity: 0, active: true }];
    const rank = (row) => {
      const index = STANDARD_SIZES.indexOf(row.size);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    onChange(next.sort((a, b) => rank(a) - rank(b)));
  }

  function addCustom() {
    const size = custom.trim().toUpperCase();
    if (!size || chosen.has(size)) {
      setCustom("");
      return;
    }

    onChange([...rows, { size, stockQuantity: 0, active: true }]);
    setCustom("");
  }

  function patchRow(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const totalStock = rows
    .filter((row) => row.active)
    .reduce((sum, row) => sum + (Number(row.stockQuantity) || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-ink-700">Sizes</p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Tap to add or remove. Each size gets its own stock count.
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {STANDARD_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              disabled={disabled}
              onClick={() => toggleSize(size)}
              aria-pressed={chosen.has(size)}
              className={cx(
                "min-w-12 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
                chosen.has(size)
                  ? "bg-brand-600 text-white ring-1 ring-brand-600"
                  : "bg-white text-ink-700 ring-1 ring-ink-300 hover:bg-ink-50",
              )}
            >
              {size}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Input
            value={custom}
            disabled={disabled}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Other size — 38, Free Size…"
            className="h-8 w-52 text-xs"
            aria-label="Add a custom size"
            maxLength={20}
          />
          <Button size="sm" variant="secondary" disabled={disabled || !custom.trim()} onClick={addCustom}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          No sizes yet. A product with no sizes has nothing a shopper can add to a bag — pick at
          least one above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">On sale</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((row, index) => {
                const stock = Number(row.stockQuantity) || 0;
                return (
                  <tr key={row.size} className={cx(!row.active && "bg-ink-50/60")}>
                    <td className="px-3 py-2 font-semibold text-ink-800">{row.size}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={row.stockQuantity}
                        onChange={(e) => patchRow(index, { stockQuantity: e.target.value })}
                        className="tabular h-8 w-24 px-2 py-0 text-right"
                        aria-label={`Stock for size ${row.size}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StockBadge active={row.active} stock={stock} />
                    </td>
                    <td className="px-3 py-2">
                      <Toggle
                        checked={row.active}
                        disabled={disabled}
                        onChange={(value) => patchRow(index, { active: value })}
                        label={`Sell size ${row.size}`}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        aria-label={`Remove size ${row.size}`}
                        onClick={() => removeRow(index)}
                      >
                        <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-200 bg-ink-50/60 text-xs">
                <td className="px-3 py-2 font-medium text-ink-600">
                  {rows.length} size{rows.length === 1 ? "" : "s"}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold text-ink-800">
                  {number(totalStock)}
                </td>
                <td className="px-3 py-2 text-ink-500" colSpan={3}>
                  units on hand
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Mirrors the API's thresholds: 0 is out, 1–5 is low. */
export function StockBadge({ active, stock, className }) {
  if (!active) {
    return (
      <Badge tone="slate" className={className}>
        Not on sale
      </Badge>
    );
  }

  if (stock <= 0) {
    return (
      <Badge tone="red" className={className}>
        Out of stock
      </Badge>
    );
  }

  if (stock <= 5) {
    return (
      <Badge tone="amber" className={className}>
        Low stock
      </Badge>
    );
  }

  return (
    <Badge tone="green" className={className}>
      In stock
    </Badge>
  );
}
