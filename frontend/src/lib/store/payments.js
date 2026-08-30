/**
 * Storefront payment calls against the Express API (F-10).
 *
 * The sibling of lib/store/orders.js, and it follows the same two rules:
 * every call names its token explicitly, because the shared client falls back
 * to the *admin* token when none is given; and expected failures come back as
 * `{ ok: false }` rather than throwing, because "your card was declined" is an
 * outcome of a checkout page, not an exception.
 *
 * What this module deliberately does not do is decide anything about money.
 * It carries three strings from Razorpay's checkout script to the API, which
 * checks them against a secret this browser has never seen. A payment is
 * confirmed by the server or it is not confirmed at all — nothing here can
 * mark an order paid, and that is the point.
 */

import { api, ApiError } from "@/lib/api/client";

function toFailure(error, fallbackField = null) {
  if (!(error instanceof ApiError)) throw error;

  const named = Object.keys(error.fields ?? {})[0];

  return {
    ok: false,
    code: error.code,
    status: error.status,
    field: named ?? fallbackField,
    error: named ? error.fields[named] : error.message,
  };
}

// ============================================================
// IS THERE A GATEWAY AT ALL?
// ============================================================

/**
 * Whether the API can take an online payment right now.
 *
 * Asked before a "Pay now" button is rendered rather than discovered when it
 * is pressed. A backend with no Razorpay keys is a working backend — the shop
 * was taking bank transfers long before a gateway existed — so the honest
 * screen in that case is one that says the shop will be in touch, not a
 * button that 503s.
 *
 * Failure is treated as "not available". If the API cannot be reached, the
 * shopper cannot pay through it either, and the fallback copy is right.
 */
export async function fetchPaymentConfig({ signal } = {}) {
  try {
    const config = await api.get("/payments/getPaymentConfig", {
      token: null,
      signal,
    });

    return config ?? { enabled: false };
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    return { enabled: false };
  }
}

// ============================================================
// OPENING A PAYMENT
// ============================================================

/**
 * Opens a payment for an order the API has already accepted (F-10.01).
 *
 * There is no amount in this call. The server reads it from the order, for
 * the same reason checkout sends no prices: a figure this browser could send
 * is a figure this browser could change.
 *
 * `token` is the signed-in shopper's, or null for a guest — a guest's claim
 * on their order is the order id itself, which the API only ever handed to
 * them.
 */
export async function createPaymentSession(orderId, token = null) {
  try {
    const session = await api.post(
      `/payments/createPaymentSession/${encodeURIComponent(orderId)}`,
      undefined,
      { token },
    );

    return { ok: true, session };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Hands Razorpay's answer to the API to be verified (F-10.02).
 *
 * The three fields come straight off the checkout script's success callback,
 * renamed out of Razorpay's `razorpay_*` convention at the point they are
 * received so that the rest of this codebase does not have to speak it.
 *
 * Resolves with the order as the API now sees it — confirmed, if the
 * signature checked out. A rejection here does not mean the money is lost: it
 * means this browser's claim could not be verified, and the webhook may well
 * confirm the same payment a second later. The copy on the failure path says
 * so rather than telling somebody their payment failed when it may not have.
 */
export async function verifyPayment({ providerOrderId, providerPaymentId, signature }) {
  try {
    const order = await api.post(
      "/payments/verifyPayment",
      { providerOrderId, providerPaymentId, signature },
      { token: null },
    );

    return { ok: true, order };
  } catch (error) {
    return toFailure(error);
  }
}
