"use client";

/**
 * "My orders" on the account page (F-07.02).
 *
 * Signed-in only, and the only screen on the storefront that fetches at
 * runtime — everything else renders from the committed catalogue snapshot.
 * That is unavoidable here: an order list is per-person and changes as the
 * shop packs, so there is nothing to prerender.
 *
 * The API is the authority on what may be read. This component passes the
 * shopper's token and shows what comes back; it never filters by id itself,
 * because a client-side ownership check is decoration — the server already
 * refuses another shopper's order with a 404.
 */

import { AlertCircle, Loader2, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiError, NETWORK_ERROR } from "@/lib/api/client";
import { cancelOrder, fetchMyOrders } from "@/lib/store/orders";
import { useAuth } from "./AuthProvider";
import { OrderCard } from "./OrderSummary";
import { PayNow } from "./PayNow";

export function OrderHistory({ shop }) {
  const { token, isSignedIn } = useAuth();

  const [orders, setOrders] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  /**
   * Promise chaining rather than `await`, matching <AuthProvider>'s /me call.
   *
   * The state only ever moves in a `.then` or a `.catch`, which is the shape
   * an effect is allowed to have: nothing here sets state while the effect
   * body is still running, so mounting cannot cascade renders.
   */
  const load = useCallback(
    (signal) =>
      fetchMyOrders(token, { signal })
        .then(({ orders: rows }) => {
          setOrders(rows);
          setError(null);
        })
        .catch((thrown) => {
          // An aborted request is an unmount, not a failure.
          if (thrown?.name === "AbortError") return;

          setOrders([]);
          setError(
            thrown instanceof ApiError && thrown.code === NETWORK_ERROR
              ? "Could not reach the shop. Your orders are safe — try again in a moment."
              : "Your orders could not be loaded just now.",
          );
        }),
    [token],
  );

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();
    load(controller.signal);

    return () => controller.abort();
  }, [token, load]);

  if (!isSignedIn) return null;

  async function onCancel(order) {
    setBusyId(order.id);

    const result = await cancelOrder(order.id, {}, token);

    setBusyId(null);

    if (!result.ok) {
      // A refusal here is nearly always "the shop already started packing",
      // which is worth showing verbatim — it tells the shopper what to do
      // next better than any wording invented here.
      setError(result.error);
      return;
    }

    // Re-read rather than patching the row in place. Cancelling also moves
    // stock, and a re-read is the cheap way to be sure this list agrees with
    // the shop's own view of the order.
    setError(null);
    load();
  }

  return (
    <section id="my-orders" className="mt-8 scroll-mt-40 wide:scroll-mt-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold text-sb-heading">Your orders</h2>
        <Link
          href="/track"
          className="text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
        >
          Track an order placed as a guest
        </Link>
      </div>

      {error ? (
        <p className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-4 py-3 text-sm font-medium text-sb-link">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {orders === null ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-sb-text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your orders…
        </p>
      ) : orders.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-sb-gold/50 bg-sb-surface/25 px-6 py-10 text-center">
          <PackageSearch className="mx-auto size-7 text-sb-gold-text" aria-hidden="true" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-sb-text-muted">
            No orders yet. Anything you order while signed in shows up here —
            orders placed as a guest are found with their number instead.
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              actions={
                // Both actions belong to the same moment and no other:
                // an order awaiting payment can still be paid for, and
                // can still be called off. Past that the API refuses
                // both, and a button that is always going to fail is
                // worse than no button.
                order.status === "pending_payment" ? (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                    {/* Renders nothing when the shop has no gateway
                        configured, leaving just the cancel link. */}
                    <PayNow
                      order={order}
                      shop={shop}
                      compact
                      // Re-read rather than patching the row: paying moves
                      // the order's status and its timestamps together, and
                      // this list should agree with the shop's own view.
                      onPaid={() => load()}
                    />

                    <button
                      type="button"
                      onClick={() => onCancel(order)}
                      disabled={busyId === order.id}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-sb-text-muted underline underline-offset-4 transition-colors hover:text-sb-link disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === order.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      Cancel this order
                    </button>
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
