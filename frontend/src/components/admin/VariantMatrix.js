"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { money } from "@/lib/format";
import { buildSku } from "@/lib/mock/store";
import { ColourSwatch } from "./ProductThumb";
import { Badge, Button, cx, Input, RequirementTag } from "./ui";

/**
 * F-03.03 — variant builder.
 *
 * Sizes × colours generates the grid; only values approved in the attribute
 * register (F-03.09) are offered. Each generated row can then be tuned
 * individually — stock, an optional price_override, an optional
 * discount_percent_override (F-03.12).
 */
export function VariantMatrix({
  rows,
  onChange,
  attributes,
  categoryId,
  productId = 0,
  basePrice = 0,
  discountPercent = 0,
  errors = [],
  showAdvanced = true,
}) {
  const [pickedSizes, setPickedSizes] = useState([]);
  const [pickedColours, setPickedColours] = useState([]);

  const approvedSizes = useMemo(
    () => (attributes?.sizes || []).filter((s) => s.approved).sort((a, b) => a.sort - b.sort),
    [attributes],
  );
  const approvedColours = useMemo(
    () => (attributes?.colours || []).filter((c) => c.approved),
    [attributes],
  );

  const errorFor = (index) => errors.filter((e) => e.index === index).map((e) => e.message);

  function toggle(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function generate() {
    const existing = new Set(rows.map((r) => `${r.size}|${r.colour}`));
    const created = [];
    for (const colour of pickedColours) {
      const hex = approvedColours.find((c) => c.value === colour)?.hex || "#94a3b8";
      for (const size of pickedSizes) {
        const key = `${size}|${colour}`;
        if (existing.has(key)) continue;
        existing.add(key);
        created.push({
          key: `${key}-${created.length}-${rows.length}`,
          size,
          colour,
          colour_hex: hex,
          sku: buildSku({ categoryId: categoryId || 0, productId, size, colour }),
          stock_quantity: 0,
          price_override: "",
          discount_percent_override: "",
          is_active: true,
        });
      }
    }
    onChange([...rows, ...created]);
    setPickedSizes([]);
    setPickedColours([]);
  }

  function patchRow(index, patch) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const willCreate = pickedSizes.length * pickedColours.length;
  const duplicates = useMemo(() => {
    const seen = new Set();
    const dupes = new Set();
    rows.forEach((r) => {
      const key = `${r.size}|${r.colour}`;
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    });
    return dupes;
  }, [rows]);

  const effective = (row) => {
    const price = row.price_override === "" ? Number(basePrice) || 0 : Number(row.price_override) || 0;
    const pct =
      row.discount_percent_override === ""
        ? Number(discountPercent) || 0
        : Number(row.discount_percent_override) || 0;
    return Math.round(price * (100 - pct)) / 100;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-ink-50 p-3 ring-1 ring-inset ring-ink-200">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-700">
          Generate combinations
          <RequirementTag id="F-03.03" />
        </p>

        <div className="space-y-2.5">
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-500">Sizes</p>
            <div className="flex flex-wrap gap-1.5">
              {approvedSizes.map((size) => (
                <Chip
                  key={size.value}
                  active={pickedSizes.includes(size.value)}
                  onClick={() => toggle(pickedSizes, setPickedSizes, size.value)}
                >
                  {size.value}
                </Chip>
              ))}
              {approvedSizes.length === 0 ? (
                <span className="text-xs text-ink-400">No approved sizes — add one in Approved attributes.</span>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-500">Colours</p>
            <div className="flex flex-wrap gap-1.5">
              {approvedColours.map((colour) => (
                <Chip
                  key={colour.value}
                  active={pickedColours.includes(colour.value)}
                  onClick={() => toggle(pickedColours, setPickedColours, colour.value)}
                >
                  <ColourSwatch hex={colour.hex} name={colour.value} size={11} />
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={!willCreate} onClick={generate}>
            Generate {willCreate || ""} variant{willCreate === 1 ? "" : "s"}
          </Button>
          <span className="text-[11px] text-ink-500">
            {pickedSizes.length} size{pickedSizes.length === 1 ? "" : "s"} × {pickedColours.length} colour
            {pickedColours.length === 1 ? "" : "s"}. Existing combinations are skipped.
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 px-4 py-8 text-center">
          <p className="text-sm font-medium text-ink-700">No variants yet</p>
          <p className="mt-1 text-xs text-ink-500">
            A product with no variants has nothing to sell — stock, SKU and cart lines all attach here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-ink-200">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[10px] font-semibold tracking-wide text-ink-500 uppercase">
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2">Colour</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">Stock</th>
                {showAdvanced ? <th className="px-3 py-2 text-right">Price override</th> : null}
                {showAdvanced ? <th className="px-3 py-2 text-right">Disc. %</th> : null}
                <th className="px-3 py-2 text-right">Customer pays</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((row, index) => {
                const messages = errorFor(index);
                const duplicate = duplicates.has(`${row.size}|${row.colour}`);
                return (
                  <tr
                    key={row.key || `${row.size}-${row.colour}-${index}`}
                    className={cx(messages.length || duplicate ? "bg-red-50/70" : "bg-white")}
                  >
                    <td className="px-3 py-2 font-semibold text-ink-800">{row.size}</td>
                    <td className="px-3 py-2 text-ink-700">
                      <ColourSwatch hex={row.colour_hex} name={row.colour} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.sku}
                        onChange={(e) => patchRow(index, { sku: e.target.value })}
                        className="h-7 px-2 py-0 font-mono text-[11px]"
                        aria-label={`SKU for ${row.size} ${row.colour}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={row.stock_quantity}
                        onChange={(e) => patchRow(index, { stock_quantity: e.target.value })}
                        className="tabular h-7 w-20 px-2 py-0 text-right"
                        aria-label={`Stock for ${row.size} ${row.colour}`}
                      />
                    </td>
                    {showAdvanced ? (
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          placeholder={String(basePrice || 0)}
                          value={row.price_override}
                          onChange={(e) => patchRow(index, { price_override: e.target.value })}
                          className="tabular h-7 w-24 px-2 py-0 text-right"
                          aria-label={`Price override for ${row.size} ${row.colour}`}
                        />
                      </td>
                    ) : null}
                    {showAdvanced ? (
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder={String(discountPercent || 0)}
                          value={row.discount_percent_override}
                          onChange={(e) => patchRow(index, { discount_percent_override: e.target.value })}
                          className="tabular h-7 w-20 px-2 py-0 text-right"
                          aria-label={`Discount override for ${row.size} ${row.colour}`}
                        />
                      </td>
                    ) : null}
                    <td className="tabular px-3 py-2 text-right font-semibold text-ink-900">
                      {money(effective(row))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove ${row.size} ${row.colour}`}
                        className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </td>
                    {messages.length ? (
                      <td className="hidden">{messages.join(" ")}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {errors.length ? (
        <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-xs text-red-700 ring-1 ring-inset ring-red-200">
          {errors.map((e, i) => (
            <li key={i}>
              {e.index >= 0 && rows[e.index] ? (
                <strong className="font-semibold">
                  {rows[e.index].size} / {rows[e.index].colour}:{" "}
                </strong>
              ) : null}
              {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <Badge tone="neutral">{rows.length} variants</Badge>
          <Badge tone="neutral">
            {rows.reduce((sum, r) => sum + (Number(r.stock_quantity) || 0), 0)} units
          </Badge>
          <span>
            Blank override fields inherit the product price — the normal case, and what bulk upload
            produces.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-brand-600 text-white ring-1 ring-brand-600"
          : "bg-white text-ink-700 ring-1 ring-ink-300 hover:bg-ink-50",
      )}
    >
      {children}
    </button>
  );
}
