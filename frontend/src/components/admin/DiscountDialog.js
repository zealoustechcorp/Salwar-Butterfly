"use client";

import { useMemo, useState } from "react";

import { applyDiscount, removeDiscount } from "@/lib/api/products";
import { money } from "@/lib/format";
import { Button, Field, Input, Modal, useToast } from "./ui";

const PRESETS = [5, 10, 15, 20, 25, 30, 40, 50];

/**
 * F-03.12 — "Allocate and remove discount/offer price for a specific product or
 * variant using discount percentage values."
 *
 * Percentages only. The sale price is always derived, never typed, so the two
 * numbers cannot drift apart the way independent price columns would.
 */
export function DiscountDialog({ open, onClose, targets, onDone }) {
  // The form lives in its own component so closing the dialog unmounts it and
  // the next open starts clean — no reset-on-open effect needed.
  if (!open) return null;
  return <DiscountForm onClose={onClose} targets={targets} onDone={onDone} />;
}

function DiscountForm({ onClose, targets, onDone }) {
  const [percent, setPercent] = useState(10);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const { products = [], variants = [] } = targets || {};
  const count = products.length + variants.length;

  const preview = useMemo(() => {
    const sample = products[0] || variants[0];
    if (!sample) return null;
    const base = sample.base_price ?? sample.pricing?.unit_price ?? 0;
    const value = Number(percent) || 0;
    return { label: sample.name || sample.sku, base, next: Math.round(base * (100 - value)) / 100 };
  }, [products, variants, percent]);

  async function run(mode) {
    setBusy(true);
    setError(null);
    const payload = {
      productIds: products.map((p) => p.id),
      variantIds: variants.map((v) => v.id),
    };
    try {
      const result =
        mode === "apply" ? await applyDiscount({ ...payload, percent }) : await removeDiscount(payload);
      toast.success(result.message);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err);
      if (err.fields?.percent) setError({ ...err, message: err.fields.percent });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      requirement="F-03.12"
      title="Discount / offer price"
      description={`${count} selected — ${products.length} product${products.length === 1 ? "" : "s"}, ${variants.length} variant${variants.length === 1 ? "" : "s"}.`}
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
          error={error?.fields?.percent}
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
              Variant selections write <code className="font-mono">discount_percent_override</code>; product
              selections write <code className="font-mono">discount_percent</code>. Overrides win.
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
