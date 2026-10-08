"use client";

import { useState } from "react";

import { deleteProducts, setActive } from "@/lib/api/products";
import { Button, Modal, useToast } from "./ui";

/**
 * Multi-select delete or deactivate, subject to the database's rules.
 *
 * The rule that matters: anything an order line points at is protected
 * by a foreign key, because orders are immutable financial records. The
 * API is the only thing that knows whether a given row is referenced, so
 * the delete is attempted and whatever it refuses comes back listed with
 * its reason — those rows can still be deactivated, which is what
 * retiring a sold product actually means.
 */
export function DeleteDialog({ open, onClose, products, onDone }) {
  if (!open) return null;
  return <DeleteConfirm onClose={onClose} products={products} onDone={onDone} />;
}

function DeleteConfirm({ onClose, products = [], onDone }) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const toast = useToast();

  async function runDelete() {
    setBusy(true);
    try {
      const result = await deleteProducts(products);

      if (result.deleted) {
        toast.success(
          `Deleted ${result.deleted} product${result.deleted === 1 ? "" : "s"}.`,
          result.blocked.length
            ? `${result.blocked.length} could not be deleted and were left untouched.`
            : undefined,
        );
      } else {
        toast.error("Nothing was deleted.");
      }

      // Anything the API refused stays on screen with its reason, so the
      // admin can deactivate instead without re-selecting.
      if (result.blocked.length) setBlocked(result.blocked);
      else onClose();

      await onDone?.(result);
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
        productIds: products.map((product) => product.id),
        active: false,
      });
      toast.success(result.message);
      await onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Deactivation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Delete or deactivate"
      description={`${products.length} product${products.length === 1 ? "" : "s"} selected.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" busy={busy} onClick={runDeactivate}>
            Deactivate instead
          </Button>
          <Button variant="danger" busy={busy} onClick={runDelete}>
            Delete {products.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="max-h-48 overflow-y-auto rounded-lg ring-1 ring-ink-200">
          <ul className="divide-y divide-ink-100">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
                  {product.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-400">/{product.slug}</span>
              </li>
            ))}
          </ul>
        </div>

        {blocked.length ? (
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-200">
            <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">
              {blocked.length} could not be deleted
            </p>
            <ul className="mt-1.5 space-y-1">
              {blocked.map((row) => (
                <li key={row.id} className="text-xs text-amber-900">
                  <strong className="font-medium">{row.label}</strong> — {row.reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-amber-800/80">
              Deactivate them instead — that retires them from the storefront and keeps any order
              history intact.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-ink-500">
            Deleting is permanent. A product referenced by an order line is protected by the
            database and will be reported back here rather than removed.
          </p>
        )}
      </div>
    </Modal>
  );
}
