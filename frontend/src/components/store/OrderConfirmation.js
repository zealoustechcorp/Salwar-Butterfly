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
 * sessionStorage rather than localStorage: it belongs to this tab and dies
 * with it, so a confirmation is for the shopper who just checked out, not for
 * the next person to open this browser.
 *
 * Every order this page shows has been paid for — checkout only comes here
 * once the payment is verified. The one in-between state is `confirming`:
 * Razorpay took the money but the verify call did not come back, and the
 * webhook is placing the order server-side. That order has no number yet, so
 * the page says the confirmation is on its way rather than showing one.
 *
 * If it is not there — a direct visit, a new tab, a browser that blocks
 * storage — this does not pretend. It says so and points at the tracking
 * page, which needs only the order number and the email.
 */

import { CheckCircle2, Clock, Mail, Package } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { useAuth } from "./AuthProvider";
import { LAST_ORDER_KEY } from "./CheckoutView";
import { OrderAddress, OrderLines, OrderStatusBadge } from "./OrderSummary";

/**
 * The order, read out of sessionStorage.
 *
 * Read through `useSyncExternalStore` rather than an effect, the same way
 * <StoreProvider> reads the bag: the server snapshot is empty, so the server
 * render and its hydration always agree, and React swaps in the real value
 * immediately afterwards with no flash of the wrong screen.
 *
 * `read` has to be stable to be a legal snapshot function — two calls with
 * nothing changed must return the same object. The memo below is keyed by
 * the raw stored string rather than being a plain "last order" variable:
 * storage is the only source of truth, so a new order written by checkout
 * (a client navigation, the module not reloaded) is a new string and is
 * parsed afresh, and an emptied entry reads as nothing — never as whichever
 * order this tab happened to show last.
 *
 * `undefined` means "not looked yet", `null` means "looked, nothing there".
 * The two are distinct because the empty case is a real screen rather than a
 * spinner that never resolves.
 */
let memo = { raw: null, order: null };

function read() {
  let raw = null;

  try {
    raw = window.sessionStorage.getItem(LAST_ORDER_KEY);
  } catch {
    // Storage blocked: nothing could have been written either.
    return null;
  }

  if (raw === null) return null;
  if (raw === memo.raw) return memo.order;

  let order = null;

  try {
    order = JSON.parse(raw);
  } catch {
    // A corrupt entry: show nothing rather than guess.
  }

  memo = { raw, order: order && typeof order === "object" ? order : null };
  return memo.order;
}

/**
 * Nothing on this page writes the entry while it is mounted, and another tab
 * cannot (sessionStorage is per tab), so there is nothing to notify.
 */
const subscribe = () => () => {};

export function OrderConfirmation() {
  const stored = useSyncExternalStore(subscribe, read, () => undefined);
  const { isSignedIn } = useAuth();

  // An unpaid order stored by this tab before checkout took payment first is
  // not something this page confirms any more.
  const order =
    stored && stored.status === "pending_payment" && !stored.confirming ? null : stored;

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
          This page shows the confirmation for an order placed in this tab. If
          you have closed it, your order is safe — look it up with the number
          from your confirmation email or WhatsApp and the email you used.
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

  // Paid, and the shop's webhook is placing the order right now.
  const confirming = Boolean(order.confirming);

  return (
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-13 lg:px-8">
      {/* One column on phones and tablets. From lg up the page splits: the
          thank-you, the number and the next steps on the left, the receipt
          itself on the right — a single narrow column left most of a wide
          screen empty. */}
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <div className="flex items-center gap-2.5">
            {confirming ? (
              <Clock className="size-5 text-sb-gold-text" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-5 text-sb-link" aria-hidden="true" />
            )}
            <p className="sb-eyebrow text-[10px] text-sb-gold-text">
              {confirming ? "Payment received" : "Order confirmed"}
            </p>
          </div>

          <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            Thank you, {order.contact.name.split(" ")[0]}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
            {confirming
              ? "Your payment went through and the shop is confirming it. This takes a moment — your order number will arrive by email and WhatsApp as soon as it is confirmed."
              : "Payment received. Your pieces are being picked, and the shop will send them within 7 to 10 working days."}
          </p>

          {/* The number, given its own block. It is the one thing on this page
              worth writing down, and the only thing needed to find the order
              again without an account. */}
          {confirming ? null : (
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
                  Keep this number. With it and your mobile number{" "}
                  <span className="font-semibold text-sb-text tabular">{order.contact.phone}</span>{" "}
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
          )}

          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-sb-surface/40 px-4 py-3.5">
            <Package className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-sb-text-muted">
              Delivery takes 7 to 10 working days, free all over India, and every
              piece is QC-checked before it is dispatched.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="grid gap-7 rounded-2xl border border-sb-gold/30 bg-sb-bg p-5 sm:grid-cols-2 sm:p-6 lg:p-8">
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

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
            >
              Keep shopping
            </Link>
            {/* A guest has no order list — /account would only open the sign-in
                dialog — so they are pointed at tracking by number instead. */}
            <Link
              href={isSignedIn ? "/account#my-orders" : "/track"}
              className="inline-flex rounded-full border border-sb-gold/50 px-7 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
            >
              {isSignedIn ? "Your orders" : "Track this order"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
