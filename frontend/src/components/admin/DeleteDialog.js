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
 *
 * The dialog owns its subject. It snapshots the products it was opened
 * with, and after a partial delete narrows that to the blocked ones, so
 * "Deactivate instead" acts on exactly the rows listed as refused. It
 * used to read the caller's live selection instead — and the caller's
 * onDone refreshed the list and cleared that selection while the dialog
 * was still open, so the button deactivated nothing and announced
 * success. For the same reason onDone now runs once, when the dialog
 * closes, carrying the last delete result.
 */
export function DeleteDialog({ open, onClose, products, onDone }) {
  if (!open) return null;
  return <DeleteConfirm onClose={onClose} products={products} onDone={onDone} />;
}

function DeleteConfirm({ onClose, products: initialProducts = [], onDone }) {
  // Fixed at open (see the note above): the caller's list may change
  // underneath an open dialog.
  const [products, setProducts] = useState(initialProducts);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState([]);
  // What to hand onDone at close — null until something was written.
  const [outcome, setOutcome] = useState(null);
  const toast = useToast();

  function close(finalOutcome = outcome) {
    onClose();
    if (finalOutcome) onDone?.(finalOutcome);
  }

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

      const next = result.deleted ? result : outcome;
      setOutcome(next);

      // Anything the API refused stays on screen with its reason, and
      // becomes the dialog's whole subject, so "Deactivate instead"
      // acts on those rows without re-selecting.
      if (result.blocked.length) {
        const refused = new Set(result.blocked.map((row) => row.id));
        setBlocked(result.blocked);
        setProducts((current) => current.filter((product) => refused.has(product.id)));
      } else {
        close(next);
      }
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

      // Never "Deactivated 0 products." as a success.
      if (!result.count) {
        toast.error("Nothing was deactivated.");
        return;
      }

      if (result.failed.length) toast.error(result.message);
      else toast.success(result.message);

      close({ ...(outcome ?? { deleted: 0, blocked: [] }), deactivated: result.count });
    } catch (err) {
      toast.error(err.message || "Deactivation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => close()}
      title="Delete or deactivate"
      description={
        blocked.length
          ? `${products.length} product${products.length === 1 ? "" : "s"} could not be deleted.`
          : `${products.length} product${products.length === 1 ? "" : "s"} selected.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => close()} disabled={busy}>
            {outcome ? "Close" : "Cancel"}
          </Button>
          <Button variant="secondary" busy={busy} onClick={runDeactivate}>
            {blocked.length ? `Deactivate ${products.length} instead` : "Deactivate instead"}
          </Button>
          {/* Re-trying a delete the database just refused would only be
              refused again, so after a partial delete the only offer is
              the one that works. */}
          {blocked.length ? null : (
            <Button variant="danger" busy={busy} onClick={runDelete}>
              Delete {products.length}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="max-h-48 overflow-y-auto rounded-lg ring-1 ring-ink-200">
          <ul className="divide-y divide-ink-100">
            {products.map((product) => (
              // Name over slug on a phone; side by side the slug, which
              // never shrank, could push the row wider than the sheet.
              <li
                key={product.id}
                className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 truncate text-xs font-medium text-ink-800 sm:flex-1">
                  {product.name}
                </span>
                <span className="min-w-0 truncate font-mono text-[11px] text-ink-400 sm:max-w-[45%] sm:shrink-0">
                  /{product.slug}
                </span>
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
                <li key={row.id} className="text-xs break-words text-amber-900">
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
