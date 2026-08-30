"use client";

import { useMemo, useState } from "react";

import { applyDiscount, removeDiscount } from "@/lib/api/products";
import { money } from "@/lib/format";
import { Button, Field, Input, Modal, useToast } from "./ui";

const PRESETS = [5, 10, 15, 20, 25, 30, 40, 50];

/**
 * Allocates or removes an offer across the selected products.
 *
 * Percentages only. `current_price` is derived by the API from the base
 * price and the percentage, so the two numbers cannot drift apart the
 * way independent price columns would — and removing an offer is simply
 * writing 0.
 */
export function DiscountDialog({ open, onClose, products, onDone }) {
  // The form lives in its own component so closing the dialog unmounts it and
  // the next open starts clean — no reset-on-open effect needed.
  if (!open) return null;
  return <DiscountForm onClose={onClose} products={products} onDone={onDone} />;
}

function DiscountForm({ onClose, products = [], onDone }) {
  const [percent, setPercent] = useState(10);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const preview = useMemo(() => {
    const sample = products[0];
    if (!sample) return null;
    const base = Number(sample.basePrice) || 0;
    const value = Number(percent) || 0;
    return { label: sample.name, base, next: Math.round(base * (100 - value)) / 100 };
  }, [products, percent]);

  async function run(mode) {
    setBusy(true);
    setError(null);

    const productIds = products.map((product) => product.id);

    try {
      const result =
        mode === "apply"
          ? await applyDiscount({ productIds, percent })
          : await removeDiscount({ productIds });

      toast.success(
        result.message,
        result.failed.length ? `${result.failed.length} product(s) could not be updated.` : undefined,
      );
      await onDone?.();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Discount / offer price"
      description={`${products.length} product${products.length === 1 ? "" : "s"} selected.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={() => run("remove")}>
            Remove offer
          </Button>
          <Button variant="primary" busy={busy} onClick={() => run("apply")}>
            Apply {Number(percent) || 0}%
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPercent(value)}
              className={
                Number(percent) === value
                  ? "rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white"
                  : "rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-200"
              }
            >
              {value}%
            </button>
          ))}
        </div>

        <Field
          label="Discount percentage"
          required
          error={error?.fields?.percent ?? error?.fields?.discountPercentage}
          hint="0–100. Setting 0 is how an offer is removed at the database level."
        >
          <Input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={percent}
            invalid={Boolean(error?.fields?.percent)}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>

        {preview ? (
          <div className="rounded-lg bg-ink-50 p-3 ring-1 ring-inset ring-ink-200">
            <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
              Preview · {preview.label}
            </p>
            <p className="tabular mt-1 flex items-baseline gap-2">
              <span className="text-sm text-ink-400 line-through">{money(preview.base)}</span>
              <span className="text-lg font-semibold text-brand-700">{money(preview.next)}</span>
              <span className="text-xs text-ink-500">customer pays</span>
            </p>
            <p className="mt-1.5 text-[11px] text-ink-500">
              Each product is saved individually, so a failure on one leaves the rest applied.
            </p>
          </div>
        ) : null}

        {error && !error.fields?.percent ? (
          <p className="text-xs text-red-600">{error.message}</p>
        ) : null}
      </div>
    </Modal>
  );
}
