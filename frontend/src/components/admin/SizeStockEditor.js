"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { COLOUR_FALLBACK_HEX, COLOUR_GROUP, createAttributeValue } from "@/lib/api/attributes";
import { STANDARD_SIZES, variantKey } from "@/lib/api/variants";
import { number, readableOn } from "@/lib/format";
import { STOCK_LABEL, STOCK_TONE, stockStatusFor } from "@/lib/stock";
import { Badge, Button, cx, Input, Toggle, useToast } from "./ui";

/**
 * A product's sellable rows and the stock behind each.
 *
 * The sellable row is the (size, colour) pair, so this is a matrix:
 * pick the sizes once, pick the colourways once, and every combination
 * gets a row with its own stock count. Entering four sizes in three
 * colours is two lists and twelve numbers, not twelve rows typed by
 * hand.
 *
 * Both dimensions are chips — tapping one adds or removes it — because
 * the common case is a standard run (S–XL) in one or two colours, and
 * typing that out for every product is the kind of friction that makes a
 * catalogue go un-entered. Anything non-standard ("38", "Free Size") is
 * added through the free-text field; a colour missing from the register
 * is added inline, which registers it for every other product too.
 *
 * Colour is optional. A product with no colourway chosen is exactly what
 * a product was before colour existed — one row per size, colour "" —
 * and nothing here treats that as an incomplete state.
 *
 * The row order is what gets stored, so rows always read back grouped by
 * colourway and in size order rather than alphabetically (where L
 * precedes M precedes S, which looks broken).
 *
 * Shape held by the parent:
 *   [{ size: "M", colour: "Maroon", stockQuantity: 12, active: true }, ...]
 */
export function SizeStockEditor({
  rows,
  onChange,
  colours = [],
  onRegisterColour,
  disabled = false,
}) {
  const [customSize, setCustomSize] = useState("");

  const chosenSizes = distinct(rows.map((row) => row.size));
  const chosenColours = distinct(rows.map((row) => row.colour ?? ""));

  // The colourless bucket is not a colourway — it is what a product
  // looks like before one is chosen — so it never counts as "selected"
  // against the swatch chips.
  const selectedColours = chosenColours.filter(Boolean);

  // Swatches for the chips, and for any colour already on the product
  // that the register no longer offers — a retired colour must not
  // vanish from a product still selling it.
  const registered = new Map(colours.map((colour) => [colour.value, colour]));
  const offered = [
    ...colours,
    ...selectedColours
      .filter((colour) => !registered.has(colour))
      .map((colour) => ({ id: `current-${colour}`, value: colour, hex: null })),
  ];

  function commit(next) {
    onChange(inReadingOrder(next));
  }

  /**
   * Adds or removes a size across every colourway at once.
   *
   * Per-colourway, one size at a time would be the wrong unit: a shop
   * that stops stocking XL stops stocking it in all three colours, and
   * making that three clicks invites getting it wrong in one of them.
   * A single row can still be dropped from its own line below.
   */
  function toggleSize(size) {
    if (chosenSizes.includes(size)) {
      commit(rows.filter((row) => row.size !== size));
      return;
    }

    const across = chosenColours.length ? chosenColours : [""];
    commit([...rows, ...across.map((colour) => blankRow(size, colour))]);
  }

  /**
   * Adds or removes a colourway across every size.
   *
   * Two cases are deliberately not "add rows":
   *
   *   the first colour claims the existing rows. A product entered in
   *   S–XL and then marked Maroon is a Maroon product — creating four
   *   empty Maroon rows beside four colourless ones would strand the
   *   stock already counted and leave a bucket nothing can be sold from.
   *
   *   removing the last colour gives them back. The sizes and their
   *   stock survive; only the colourway is dropped. Otherwise clicking
   *   the wrong chip twice would silently destroy every count on the
   *   product.
   */
  function toggleColour(colour) {
    if (selectedColours.includes(colour)) {
      const remaining = selectedColours.filter((value) => value !== colour);

      if (remaining.length === 0) {
        commit(rows.map((row) => ({ ...row, colour: "" })));
        return;
      }

      commit(rows.filter((row) => row.colour !== colour));
      return;
    }

    if (selectedColours.length === 0 && rows.length > 0) {
      commit(rows.map((row) => ({ ...row, colour })));
      return;
    }

    const across = chosenSizes.length ? chosenSizes : [];
    commit([...rows, ...across.map((size) => blankRow(size, colour))]);
  }

  function addCustomSize() {
    const size = customSize.trim().toUpperCase();
    if (!size || chosenSizes.includes(size)) {
      setCustomSize("");
      return;
    }

    const across = chosenColours.length ? chosenColours : [""];
    commit([...rows, ...across.map((colour) => blankRow(size, colour))]);
    setCustomSize("");
  }

  function patchRow(key, patch) {
    onChange(
      rows.map((row) => (variantKey(row) === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key) {
    commit(rows.filter((row) => variantKey(row) !== key));
  }

  const totalStock = rows
    .filter((row) => row.active)
    .reduce((sum, row) => sum + (Number(row.stockQuantity) || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-ink-700">Colours</p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Optional. Each colourway gets its own stock count for every size. Leave this empty for a
          product that is not sold by colour.
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {offered.map((colour) => (
            <ColourChip
              key={colour.id}
              colour={colour}
              selected={selectedColours.includes(colour.value)}
              disabled={disabled}
              onClick={() => toggleColour(colour.value)}
            />
          ))}

          <AddColour
            disabled={disabled}
            onAdded={(value) => {
              toggleColour(value);
              onRegisterColour?.();
            }}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-ink-700">Sizes</p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Tap to add or remove. A size is added to every colourway at once.
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {STANDARD_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              disabled={disabled}
              onClick={() => toggleSize(size)}
              aria-pressed={chosenSizes.includes(size)}
              className={cx(
                "min-w-12 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
                chosenSizes.includes(size)
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
            value={customSize}
            disabled={disabled}
            onChange={(e) => setCustomSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSize();
              }
            }}
            placeholder="Other size — 38, Free Size…"
            className="h-8 w-52 text-xs"
            aria-label="Add a custom size"
            maxLength={20}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !customSize.trim()}
            onClick={addCustomSize}
          >
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
        <div className="space-y-3">
          {chosenColours.map((colour) => (
            <ColourwayTable
              key={colour || "__none"}
              colour={colour}
              hex={registered.get(colour)?.hex ?? null}
              rows={rows.filter((row) => (row.colour ?? "") === colour)}
              disabled={disabled}
              // Only offered once there is more than one colourway:
              // removing the only one is what the chip above does, and
              // it keeps the sizes rather than deleting them.
              onRemoveColourway={
                selectedColours.length > 1 && colour ? () => toggleColour(colour) : null
              }
              onPatchRow={patchRow}
              onRemoveRow={removeRow}
            />
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50/60 px-3 py-2 text-xs ring-1 ring-inset ring-ink-200">
            <span className="font-medium text-ink-600">
              {rows.length} sellable row{rows.length === 1 ? "" : "s"}
              {selectedColours.length
                ? ` · ${chosenSizes.length} size${chosenSizes.length === 1 ? "" : "s"} × ${selectedColours.length} colour${selectedColours.length === 1 ? "" : "s"}`
                : null}
            </span>
            <span className="text-ink-500">
              <strong className="tabular font-semibold text-ink-800">{number(totalStock)}</strong>{" "}
              units on hand
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** One colourway's sizes. The colourless bucket renders without a swatch. */
function ColourwayTable({
  colour,
  hex,
  rows,
  disabled,
  onRemoveColourway,
  onPatchRow,
  onRemoveRow,
}) {
  const subtotal = rows
    .filter((row) => row.active)
    .reduce((sum, row) => sum + (Number(row.stockQuantity) || 0), 0);

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-50/60 px-3 py-2">
        {colour ? (
          <>
            <Swatch hex={hex} />
            <span className="text-sm font-semibold text-ink-800">{colour}</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-ink-600">No colour</span>
        )}

        <span className="tabular ml-auto text-xs text-ink-500">
          {number(subtotal)} unit{subtotal === 1 ? "" : "s"}
        </span>

        {onRemoveColourway ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Remove the ${colour} colourway`}
            onClick={onRemoveColourway}
          >
            <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2 text-right">Stock</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">On sale</th>
            <th className="w-10 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => {
            const key = variantKey(row);
            const stock = Number(row.stockQuantity) || 0;
            // What the control is called out loud. "Stock for M" is
            // ambiguous the moment a product has two colourways.
            const label = colour ? `${colour} ${row.size}` : row.size;

            return (
              <tr key={key} className={cx(!row.active && "bg-ink-50/60")}>
                <td className="px-3 py-2 font-semibold text-ink-800">{row.size}</td>
                <td className="px-3 py-2 text-right">
                  <Input
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={row.stockQuantity}
                    onChange={(e) => onPatchRow(key, { stockQuantity: e.target.value })}
                    className="tabular h-8 w-24 px-2 py-0 text-right"
                    aria-label={`Stock for ${label}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <StockBadge active={row.active} stock={stock} />
                </td>
                <td className="px-3 py-2">
                  <Toggle
                    checked={row.active}
                    disabled={disabled}
                    onChange={(value) => onPatchRow(key, { active: value })}
                    label={`Sell ${label}`}
                    size="sm"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove ${label}`}
                    onClick={() => onRemoveRow(key)}
                  >
                    <Trash2 className="size-3.5 text-ink-400" aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ColourChip({ colour, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        selected
          ? "bg-brand-600 text-white ring-1 ring-brand-600"
          : "bg-white text-ink-700 ring-1 ring-ink-300 hover:bg-ink-50",
      )}
    >
      <Swatch hex={colour.hex} />
      {colour.value}
    </button>
  );
}

/**
 * The colour itself.
 *
 * A registered colour with no hex recorded still has to render as
 * something, so it falls back to a neutral chip rather than a
 * transparent hole — and the ring is drawn in a readable contrast
 * against whatever the fill is, so a white colourway is still visible on
 * a white card.
 */
function Swatch({ hex, className }) {
  const fill = hex || COLOUR_FALLBACK_HEX;

  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-3.5 shrink-0 rounded-full ring-1", className)}
      style={{ backgroundColor: fill, "--tw-ring-color": readableOn(fill) }}
    />
  );
}

/**
 * Registers a colour without leaving the product form.
 *
 * The same reason the attribute dropdowns can add a value inline:
 * entering a product should never mean stopping to visit the register
 * first, because that is how free text creeps back in.
 */
function AddColour({ disabled, onAdded }) {
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#7B1E3A");
  const [busy, setBusy] = useState(false);

  async function add() {
    const value = name.trim();
    if (!value) return;

    setBusy(true);
    try {
      const created = await createAttributeValue(COLOUR_GROUP.key, value, { hex });
      onAdded(created.value);
      toast.success(`"${created.value}" added to colours.`);
      setName("");
      setOpen(false);
    } catch (err) {
      toast.error(err.message || "Could not add the colour.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-600 ring-1 ring-dashed ring-ink-300 transition-colors hover:bg-ink-50 hover:text-brand-700 disabled:opacity-50"
      >
        + Add a colour
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-ink-50 p-1.5 ring-1 ring-ink-200">
      <input
        type="color"
        value={hex}
        disabled={busy}
        onChange={(e) => setHex(e.target.value)}
        aria-label="Colour swatch"
        className="size-8 shrink-0 cursor-pointer rounded border border-ink-300 bg-white p-0.5"
      />
      <Input
        value={name}
        autoFocus
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={COLOUR_GROUP.placeholder}
        maxLength={40}
        className="h-8 w-40 text-xs"
        aria-label="New colour name"
      />
      <Button size="sm" variant="primary" busy={busy} disabled={!name.trim()} onClick={add}>
        Add
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

/**
 * The stock status of a size — or of a whole product, when `stock` is
 * its total across sizes.
 *
 * The thresholds come from lib/stock.js, which mirrors the API's policy
 * module, so this badge cannot drift from the one the inventory screen
 * and the storefront show.
 */
export function StockBadge({ active, stock, className }) {
  const status = stockStatusFor(stock, active);

  return (
    <Badge tone={STOCK_TONE[status]} className={className}>
      {STOCK_LABEL[status]}
    </Badge>
  );
}

export { Swatch as ColourSwatch };

// ============================================================
// ROW BOOKKEEPING
// ============================================================

const blankRow = (size, colour) => ({
  size,
  colour: colour ?? "",
  stockQuantity: 0,
  active: true,
});

const distinct = (values) => [...new Set(values.map((value) => value ?? ""))];

/**
 * Rows in the order they are shown, and therefore the order they are
 * stored — the API replays a variant's position on read.
 *
 * Colourways keep the order they were added; sizes inside one run in the
 * standard order however the chips were clicked, with anything custom
 * ("38", "Free Size") after them in the order it was typed.
 */
function inReadingOrder(rows) {
  const colourOrder = distinct(rows.map((row) => row.colour ?? ""));
  const customOrder = distinct(rows.map((row) => row.size)).filter(
    (size) => !STANDARD_SIZES.includes(size),
  );

  const sizeRank = (size) => {
    const standard = STANDARD_SIZES.indexOf(size);
    return standard === -1
      ? STANDARD_SIZES.length + customOrder.indexOf(size)
      : standard;
  };

  return [...rows].sort(
    (a, b) =>
      colourOrder.indexOf(a.colour ?? "") - colourOrder.indexOf(b.colour ?? "") ||
      sizeRank(a.size) - sizeRank(b.size),
  );
}
