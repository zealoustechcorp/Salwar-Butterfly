/**
 * Storefront order calls against the Express API (F-07).
 *
 * The sibling of lib/store/auth.js, and it follows the same two rules.
 *
 * Every call names its token explicitly. The shared client falls back to the
 * *admin* token when none is given, so a storefront call that stayed silent
 * would send an admin's credentials from a browser that has both sessions
 * open. `token: null` is a deliberate anonymous call, not an oversight —
 * checkout and tracking are both open to guests.
 *
 * Expected failures come back as `{ ok: false }` rather than throwing. "That
 * size sold out while you were checking out" is an outcome of a checkout
 * form, not an exception, and the page has to render it next to the line it
 * concerns.
 */

import { api, ApiError } from "@/lib/api/client";

/**
 * Turns a thrown ApiError into the `{ ok: false }` shape, putting the message
 * under the field that caused it where the API named one.
 */
function toFailure(error, fallbackField = null) {
  if (!(error instanceof ApiError)) throw error;

  const named = Object.keys(error.fields ?? {})[0];

  return {
    ok: false,
    code: error.code,
    status: error.status,
    field: named ?? fallbackField,
    error: named ? error.fields[named] : error.message,
    fields: error.fields ?? {},
  };
}

// ============================================================
// PLACE AN ORDER
// ============================================================

/**
 * Checkout (F-07.01) — the first half of it.
 *
 * What this creates is a checkout *draft*, not an order: it holds the sizes
 * for a few minutes while the shopper pays, and has no order number. The
 * order is placed — numbered, confirmed, announced — only when the payment
 * opened on it is verified. See CheckoutView.
 *
 * Sends variant ids and quantities and nothing else. Prices, the subtotal and
 * the total are all read from the database when the order is written — there
 * is deliberately no field to send a price in, so the figures the bag showed
 * cannot disagree with what is charged.
 *
 * `token` is the signed-in shopper's, or null for a guest. Which account the
 * order attaches to is decided from that token on the server; there is no
 * customer id in this payload and sending one would not work.
 *
 * @param {object} input
 * @param {{name: string, email: string, phone: string}} input.contact
 * @param {object} input.shippingAddress
 * @param {Array<{variantId: string, quantity: number}>} input.items
 * @param {string} [input.customerNote]
 * @param {boolean} [input.whatsappOptIn]  the "WhatsApp me updates" tick. The
 *        API refuses anything but a real boolean, and the notification service
 *        sends nothing for an order without it — so dropping it here silently
 *        unsubscribed every shopper who left it ticked.
 * @param {string|null} [token]
 */
export async function placeOrder(
  { contact, shippingAddress, items, customerNote, whatsappOptIn },
  token = null,
) {
  try {
    const order = await api.post(
      "/orders/placeOrder",
      {
        contact,
        shippingAddress,
        items,
        customerNote: customerNote || undefined,
        whatsappOptIn: typeof whatsappOptIn === "boolean" ? whatsappOptIn : undefined,
      },
      { token },
    );

    return { ok: true, order };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Gives a checkout draft's held sizes back straight away.
 *
 * For a shopper who closed the payment sheet and then changed their bag:
 * without it, cutting two pieces to one could be refused by their own hold.
 * Best effort and silent — the hold runs out on its own in a few minutes
 * anyway, and the API only ever releases an unpaid draft.
 */
export async function abandonCheckout(id, token = null) {
  try {
    await api.post(`/orders/abandonCheckout/${encodeURIComponent(id)}`, undefined, { token });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
}

// ============================================================
// READING ORDERS
// ============================================================

/**
 * One page of the shopper's own orders (F-07.02), newest first.
 *
 * `pagination` is the API's `{ page, limit, total, totalPages, hasNextPage }`
 * — what the order list reads to decide whether to offer "Show more".
 *
 * Throws rather than returning `{ ok }` — the caller is a screen loading its
 * own data, not a form, and it needs to tell "signed out" from "the API is
 * unreachable" to decide between redirecting and offering a retry.
 */
export async function fetchMyOrders(token, { signal, limit = 20, page = 1 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });

  const { data, meta } = await api.get(`/orders/getMyOrders?${query}`, {
    token,
    signal,
    envelope: true,
  });

  return { orders: data ?? [], pagination: meta?.pagination ?? null };
}

/**
 * Tracking without an account (F-07.02).
 *
 * The number alone is not enough — order numbers run in sequence, so knowing
 * one is knowing roughly where the others are. The email that placed it is
 * the second factor, and a wrong number and a wrong email fail identically so
 * this cannot be used to test whether an order exists.
 */
export async function trackOrder({ orderNumber, email }) {
  try {
    const order = await api.post(
      "/orders/trackOrder",
      { orderNumber, email },
      { token: null },
    );

    return { ok: true, order };
  } catch (error) {
    return toFailure(error, "orderNumber");
  }
}

// ============================================================
// PRESENTATION
// ============================================================

/**
 * How each status reads on the storefront.
 *
 * The API's words are the shop's — `pending_payment`, `confirmed`. A shopper
 * is not waiting for the shop to be confirmed, they are waiting for their
 * parcel, so the copy here is written from their side of the counter.
 *
 * `tone` maps to the badge colours the storefront already uses.
 */
export const ORDER_STATUS_COPY = {
  // Only ever seen on an order from before checkout took payment up front.
  pending_payment: {
    label: "Awaiting payment",
    tone: "wait",
    detail: "The shop will confirm your payment and start packing.",
  },
  confirmed: {
    label: "Confirmed",
    tone: "good",
    detail: "Payment received. Your pieces are being picked.",
  },
  packed: {
    label: "Packed",
    tone: "good",
    detail: "Boxed and waiting for the courier.",
  },
  shipped: {
    label: "On its way",
    tone: "good",
    detail: "Handed to the courier. 5 to 10 working days.",
  },
  delivered: {
    label: "Delivered",
    tone: "done",
    detail: "Delivered. We hope it fits beautifully.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "off",
    detail: "This order was cancelled and nothing was charged.",
  },
};

export const statusCopy = (status) =>
  ORDER_STATUS_COPY[status] ?? { label: status, tone: "wait", detail: "" };
