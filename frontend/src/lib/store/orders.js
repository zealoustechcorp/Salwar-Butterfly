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
 * Checkout (F-07.01).
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
 * @param {string|null} [token]
 */
export async function placeOrder(
  { contact, shippingAddress, items, customerNote },
  token = null,
) {
  try {
    const order = await api.post(
      "/orders/placeOrder",
      { contact, shippingAddress, items, customerNote: customerNote || undefined },
      { token },
    );

    return { ok: true, order };
  } catch (error) {
    return toFailure(error);
  }
}

// ============================================================
// READING ORDERS
// ============================================================

/**
 * The shopper's own orders (F-07.02), newest first.
 *
 * Throws rather than returning `{ ok }` — the caller is a screen loading its
 * own data, not a form, and it needs to tell "signed out" from "the API is
 * unreachable" to decide between redirecting and offering a retry.
 */
export async function fetchMyOrders(token, { signal, limit = 20 } = {}) {
  const { data, meta } = await api.get(
    `/orders/getMyOrders?limit=${encodeURIComponent(limit)}`,
    { token, signal, envelope: true },
  );

  return { orders: data ?? [], pagination: meta?.pagination ?? null };
}

/** One order, by id. Either token works; the server decides what may be seen. */
export async function fetchOrder(id, token, { signal } = {}) {
  return api.get(`/orders/getOrderById/${encodeURIComponent(id)}`, {
    token,
    signal,
  });
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
// CANCELLING
// ============================================================

/**
 * Cancels the shopper's own order (F-07.05).
 *
 * Only while it is still awaiting payment — after that the shop has started
 * picking and the API refuses with a 409 saying so. The reason is optional
 * for a shopper.
 */
export async function cancelOrder(id, { reason } = {}, token) {
  try {
    const order = await api.post(
      `/orders/cancelOrder/${encodeURIComponent(id)}`,
      { reason: reason || undefined },
      { token },
    );

    return { ok: true, order };
  } catch (error) {
    return toFailure(error, "reason");
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
