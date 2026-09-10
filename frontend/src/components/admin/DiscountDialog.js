"use client";

import { useMemo, useState } from "react";

import { applyDiscount, removeDiscount } from "@/lib/api/products";
import { money } from "@/lib/format";
import { calculateSalePrice, MIN_PRICE, validateDiscountPercentage } from "@/lib/validate";
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

    return {
      label: sample.name,
      base: Number(sample.basePrice) || 0,
      // The API's own arithmetic, not a second version of it — the old
      // line rounded differently from the server for any percentage that
      // was not whole, so the preview showed a price nobody would pay.
      next: calculateSalePrice(sample.basePrice, percent),
    };
  }, [products, percent]);

  /**
   * The products this percentage would make free.
   *
   * Applied across a selection, one percentage meets many base prices, so
   * "100% is too much" is not the only way to get there — a low-priced
   * piece rounds to ₹0 well before a high-priced one does. The check is on
   * the outcome for each product, which is the only thing that answers it.
   */
  const wouldBeFree = products.filter(
    (product) => calculateSalePrice(product.basePrice, percent) < MIN_PRICE,
  );

  /**
   * The percentage, but only when it is about to be used.
   *
   * `min` and `max` on the input are browser hints and nothing more —
   * there is no form submit here for constraint validation to block, so
   * 150 and -5 both reach this function as typed. Removing an offer sends
   * no percentage at all, so it is not checked on that path.
   */
  const percentError =
    validateDiscountPercentage(percent) ??
    (wouldBeFree.length
      ? wouldBeFree.length === products.length
        ? "That leaves every selected product at ₹0"
        : `That leaves ${wouldBeFree.length} of the selected products at ₹0`
      : null);

  async function run(mode) {
    if (mode === "apply") {
      const problem = percentError ?? (String(percent).trim() ? null : "A percentage is required");

      if (problem) {
        setError({ fields: { percent: problem } });
        toast.error("That offer was not applied", problem);
        return;
      }
    }

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
      toast.error(
        mode === "apply" ? "Could not apply the offer" : "Could not remove the offer",
        err.message,
      );
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
          <Button
            variant="primary"
            busy={busy}
            disabled={Boolean(percentError)}
            onClick={() => run("apply")}
          >
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
          // The live check first: a percentage that is out of range is
          // wrong as soon as it is typed, and waiting for the button to be
          // pressed to say so is a preview showing a price nobody can set.
          error={
            percentError ??
            error?.fields?.percent ??
            error?.fields?.discountPercentage
          }
          hint="0–99. Setting 0 is how an offer is removed at the database level."
        >
          <Input
            type="number"
            min={0}
            max={99}
            step={0.5}
            value={percent}
            invalid={Boolean(percentError || error?.fields?.percent)}
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
