"use client";

/**
 * The page after checkout (F-07.01).
 *
 * The order it shows is the one the API returned, stashed in sessionStorage
 * by <CheckoutView> a moment ago. Reading it back rather than passing it in
 * component state is what makes a refresh survivable: the bag has already
 * been emptied, so re-rendering the checkout form here would strand somebody
 * whose order went through perfectly well.
 *
 * sessionStorage rather than localStorage, and cleared as soon as it is read.
 * A confirmation is for the shopper who just paid, not for the next person to
 * open this browser.
 *
 * If it is not there — a direct visit, a new tab, a browser that blocks
 * storage — this does not pretend. It says so and points at the tracking
 * page, which needs only the order number and the email.
 */

import { CheckCircle2, Clock, Mail, Package } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { LAST_ORDER_KEY } from "./CheckoutView";
import { OrderAddress, OrderLines, OrderStatusBadge } from "./OrderSummary";
import { PayNow } from "./PayNow";

/**
 * The order, read out of sessionStorage exactly once.
 *
 * Read through `useSyncExternalStore` rather than an effect, the same way
 * <StoreProvider> reads the bag: the server snapshot is empty, so the server
 * render and its hydration always agree, and React swaps in the real value
 * immediately afterwards with no flash of the wrong screen.
 *
 * `read` has to be stable to be a legal snapshot function, and the cache is
 * what makes it so — the second call returns the same object rather than
 * re-parsing, which matters because the first call also *clears* the entry.
 *
 * `undefined` means "not looked yet", `null` means "looked, nothing there".
 * The two are distinct because the empty case is a real screen rather than a
 * spinner that never resolves.
 *
 * Storage is checked on every call, not only the first. The cache is module
 * state, so it outlives the page: checkout reaches this screen with a client
 * navigation, the module is not reloaded, and a cache that answered without
 * looking would show the *previous* order to a shopper who just placed a new
 * one — the new entry sitting unread in storage. An entry present means a
 * fresh order and replaces the cache; an empty storage returns the cache
 * untouched, which is what keeps repeated calls stable.
 */
let cached;

function read() {
  try {
    const raw = window.sessionStorage.getItem(LAST_ORDER_KEY);

    if (raw !== null) {
      // Cleared as it is read. A confirmation belongs to the shopper who
      // just checked out, not to the next person to open this browser.
      window.sessionStorage.removeItem(LAST_ORDER_KEY);

      try {
        cached = JSON.parse(raw);
      } catch {
        // A new order whose entry is corrupt: show nothing rather than the
        // previous order.
        cached = null;
      }
    }
  } catch {
    // Storage blocked: nothing new could have been written either.
  }

  if (cached === undefined) cached = null;

  return cached;
}

/** Nothing ever changes it after the first read, so there is nothing to notify. */
const subscribe = () => () => {};

export function OrderConfirmation({ shop }) {
  const stored = useSyncExternalStore(subscribe, read, () => undefined);

  /**
   * The order as it stands after paying, if they did.
   *
   * Kept beside the stored copy rather than written back into
   * sessionStorage: the entry is cleared as it is read, and re-stashing it
   * would put a confirmation back for the next person to open this tab. The
   * page is already mounted, so state is enough — and a refresh lands on the
   * "nothing to show here" screen either way, which points at /track.
   */
  const [paid, setPaid] = useState(null);

  const order = paid ?? stored;

  if (order === undefined) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  // --------------------------------------------------------
  // NOTHING TO SHOW
  // --------------------------------------------------------

  if (!order) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-14 lg:px-8">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Order placed</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
          Nothing to show here
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-sb-text-muted">
          This page shows a confirmation once, right after you place an order.
          If you have already seen it, your order is safe — look it up with the
          number from your confirmation and the email you used.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/track"
            className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Track an order
          </Link>
          <Link
            href="/shop"
            className="inline-flex rounded-full border border-sb-gold/50 px-7 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
          >
            Keep shopping
          </Link>
        </div>
      </section>
    );
  }

  // --------------------------------------------------------
  // THE RECEIPT
  // --------------------------------------------------------

  // The API's word, not a guess: an order is awaiting payment until the
  // server has verified one. Paying below replaces `order` with what the
  // verify call returned, so this flips without a reload.
  const awaitingPayment = order.status === "pending_payment";

  return (
    <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-13 lg:px-8">
      {/* The header follows the payment, not the order. The order exists
          before it is paid for — that is what holds the sizes — but a tick
          and a "thank you" above an unpaid order read as "done" and send
          the shopper away before the step that actually confirms it. */}
      <div className="flex items-center gap-2.5">
        {awaitingPayment ? (
          <Clock className="size-5 text-sb-gold-text" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-5 text-sb-link" aria-hidden="true" />
        )}
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">
          {awaitingPayment ? "One step left" : "Order confirmed"}
        </p>
      </div>

      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
        {awaitingPayment
          ? `Almost there, ${order.contact.name.split(" ")[0]}`
          : `Thank you, ${order.contact.name.split(" ")[0]}`}
      </h1>

      <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
        {awaitingPayment
          ? "Your pieces are held for you. Pay below to confirm the order and start it on its way."
          : "Payment received. Your pieces are being picked, and the shop will send them within 5 to 10 working days."}
      </p>

      {/* The number, given its own block. It is the one thing on this page
          worth writing down, and the only thing needed to find the order
          again without an account. */}
      <div className="mt-6 rounded-2xl border border-sb-gold/40 bg-sb-surface/30 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-sb-text-muted">Your order number</p>
            <p className="mt-0.5 font-display text-2xl font-semibold text-sb-heading tabular">
              {order.orderNumber}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-sb-text-muted">
          <Mail className="mt-0.5 size-3.5 shrink-0 text-sb-gold-text" aria-hidden="true" />
          <span>
            Keep this number. With it and{" "}
            <span className="font-semibold text-sb-text">{order.contact.email}</span>{" "}
            you can{" "}
            <Link
              href="/track"
              className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
            >
              check on your order
            </Link>{" "}
            at any time.
          </span>
        </p>
      </div>

      <div className="mt-7 grid gap-7 sm:grid-cols-2">
        <div>
          <p className="sb-eyebrow mb-3 text-[10px] text-sb-gold-text">What you ordered</p>
          <OrderLines order={order} compact />
        </div>

        <div>
          <p className="sb-eyebrow mb-3 text-[10px] text-sb-gold-text">Delivering to</p>
          <OrderAddress order={order} />

          {order.customerNote ? (
            <>
              <p className="sb-eyebrow mt-5 mb-2 text-[10px] text-sb-gold-text">Your note</p>
              <p className="text-sm leading-relaxed text-sb-text-muted">
                {order.customerNote}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {awaitingPayment ? (
        <div className="mt-7 rounded-2xl border border-sb-gold/40 bg-sb-surface/30 px-5 py-5">
          <p className="font-display text-lg font-semibold text-sb-heading">
            Pay for your order
          </p>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-sb-text-muted">
            UPI through GPay, PhonePe or Paytm, or cards and net banking.
            Nothing has been charged yet, and your pieces stay held until you
            pay — you can come back to this with your order number if you would
            rather not now.
          </p>

          {/* Renders nothing at all when the shop has no gateway configured,
              which is why the fallback line below is a sibling rather than an
              else — both have to be true at once in that case. */}
          <PayNow order={order} shop={shop} onPaid={setPaid} className="mt-4" />

          <p className="mt-4 flex items-start gap-2.5 border-t border-sb-gold/25 pt-3.5 text-xs leading-relaxed text-sb-text-muted">
            <Package className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
            <span>
              If you would rather pay another way, the shop will be in touch on
              WhatsApp. Delivery takes 5 to 10 working days from confirmation,
              free all over India.
            </span>
          </p>
        </div>
      ) : (
        <div className="mt-7 flex items-start gap-2.5 rounded-xl bg-sb-surface/40 px-4 py-3.5">
          <Package className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-sb-text-muted">
            Payment received. Delivery takes 5 to 10 working days, free all
            over India, and every piece is QC-checked before it is dispatched.
          </p>
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-3 border-t border-sb-gold/30 pt-5">
        <Link
          href="/shop"
          className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
        >
          Keep shopping
        </Link>
        <Link
          href="/account"
          className="inline-flex rounded-full border border-sb-gold/50 px-7 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
        >
          Your orders
        </Link>
      </div>
    </section>
  );
}
