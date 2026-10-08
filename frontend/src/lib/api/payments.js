/**
 * Payment attempts, for the admin panel (F-10).
 *
 * The storefront's half of payment lives in lib/store/payments.js — opening a
 * sheet and verifying what comes back. This is the other half: what the shop
 * sees afterwards, which is the whole history rather than the one word on the
 * order.
 *
 * That history is the answer to the support call. "Your card was declined
 * twice and then the UPI went through at 4:12" is something the shop can say
 * from this screen; `paymentStatus: "paid"` alone is not.
 */

import { api } from "./client";

/** How each attempt status reads in the panel. */
export const ATTEMPT_STATUS_META = {
  created: {
    label: "Started",
    tone: "bg-ink-100 text-ink-600 ring-ink-200",
    blurb: "A payment window was opened. Nothing was charged.",
  },
  paid: {
    label: "Paid",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blurb: "Verified against the gateway.",
  },
  failed: {
    label: "Failed",
    tone: "bg-red-50 text-red-700 ring-red-200",
    blurb: "The gateway refused it. Nothing was charged.",
  },
  refunded: {
    label: "Refunded",
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
    blurb: "The money went back.",
  },
};

export const attemptMeta = (status) =>
  ATTEMPT_STATUS_META[status] ?? {
    label: status ?? "—",
    tone: "bg-ink-100 text-ink-600 ring-ink-200",
    blurb: "",
  };

/**
 * How the shopper paid, in the shop's words rather than the gateway's.
 *
 * Razorpay's `method` is a short lowercase token. Unknown ones are title-cased
 * and shown as-is rather than hidden — a method this map has not heard of is
 * still worth reading on a support call.
 */
const METHOD_LABEL = {
  card: "Card",
  upi: "UPI",
  netbanking: "Net banking",
  wallet: "Wallet",
  emi: "EMI",
  paylater: "Pay later",
};

export const methodLabel = (method) => {
  if (!method) return null;

  return METHOD_LABEL[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
};

/**
 * Every attempt on one order, newest first.
 *
 * Its own request rather than a field on the order, because it is a different
 * question with a different audience: the order screen is about a parcel, and
 * this is about money. Most orders have nothing here worth a round trip on
 * every list row.
 */
export async function listOrderPayments(orderId, { token, signal } = {}) {
  const data = await api.get(
    `/payments/getOrderPayments/${encodeURIComponent(orderId)}`,
    { token, signal },
  );

  return data ?? [];
}
