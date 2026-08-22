"use client";

import { useMemo, useState } from "react";

import { assessDeletion, deleteEntities, setActive } from "@/lib/api/products";
import { Badge, Button, Modal, useToast } from "./ui";

/**
 * F-03.11 — "Unique multi-select delete/deactivate of products or product
 * variants, subject to business rules."
 *
 * The business rule made explicit: rows referenced by an order are protected by
 * ON DELETE RESTRICT, because orders are immutable financial records. Those rows
 * can only be deactivated. The dialog splits the selection before anything is
 * written, so the admin sees exactly what will happen to each row.
 */
export function DeleteDialog({ open, onClose, targets, onDone }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const { products = [], variants = [] } = targets || {};

  const assessment = useMemo(() => {
    if (!open) return { deletable: { products: [], variants: [] }, blocked: [] };
    return assessDeletion({
      productIds: products.map((p) => p.id),
      variantIds: variants.map((v) => v.id),
    });
  }, [open, products, variants]);

  const deletableCount =
    assessment.deletable.products.length + assessment.deletable.variants.length;
  const blockedCount = assessment.blocked.length;

  async function runDelete() {
    setBusy(true);
    try {
      const result = await deleteEntities({
        productIds: products.map((p) => p.id),
        variantIds: variants.map((v) => v.id),
      });
      const removed = result.deleted_products + result.deleted_variants;
      if (removed)
        toast.success(
          `Deleted ${result.deleted_products} product${result.deleted_products === 1 ? "" : "s"} and ${result.deleted_variants} variant${result.deleted_variants === 1 ? "" : "s"}.`,
          result.blocked.length ? `${result.blocked.length} row(s) were protected and left untouched.` : undefined,
        );
      else toast.error("Nothing was deleted — every selected row is referenced by an order.");
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runDeactivate() {
    setBusy(true);
    try {
      const result = await setActive({
        productIds: products.map((p) => p.id),
        variantIds: variants.map((v) => v.id),
        active: false,
      });
      toast.success(result.message);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Deactivation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      requirement="F-03.11"
      title="Delete or deactivate"
      description={`${products.length} product${products.length === 1 ? "" : "s"} and ${variants.length} variant${variants.length === 1 ? "" : "s"} selected.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" busy={busy} onClick={runDeactivate}>
            Deactivate all
          </Button>
          <Button variant="danger" busy={busy} disabled={!deletableCount} onClick={runDelete}>
            {deletableCount ? `Delete ${deletableCount} unsold` : "Nothing deletable"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-red-50 p-3 ring-1 ring-inset ring-red-200">
            <p className="text-[11px] font-semibold tracking-wide text-red-700 uppercase">
              Safe to delete
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-red-800">{deletableCount}</p>
            <p className="mt-0.5 text-xs text-red-700/80">Never appeared on an order.</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
            <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
              Protected
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-amber-900">{blockedCount}</p>
            <p className="mt-0.5 text-xs text-amber-800/80">Deactivate keeps order history intact.</p>
          </div>
        </div>

        {blockedCount ? (
          <div className="overflow-hidden rounded-lg ring-1 ring-ink-200">
            <div className="max-h-56 overflow-y-auto divide-y divide-ink-100">
              {assessment.blocked.map((row) => (
                <div key={`${row.kind}-${row.id}`} className="flex items-start gap-3 px-3 py-2">
                  <Badge tone={row.kind === "product" ? "brand" : "slate"} className="mt-0.5 shrink-0">
                    {row.kind}
                  </Badge>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink-800">{row.label}</p>
                    <p className="text-[11px] text-ink-500">{row.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="text-[11px] text-ink-500">
          Deleting a product cascades to its variants and images. Deleting is permanent and is not
          offered for anything an order depends on.
        </p>
      </div>
    </Modal>
  );
}
