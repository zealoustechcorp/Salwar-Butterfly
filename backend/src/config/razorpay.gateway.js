// src/config/razorpay.gateway.js
//
// The Razorpay REST client (F-10).
//
// Sits beside cloudinary.cdn.js and does the same job: it is the only
// file in the project that knows a third party's wire format, so the
// service above it talks in rupees and order ids and never in paise,
// Basic auth headers or `rzp_` prefixes.
//
// Written against `fetch` rather than the `razorpay` npm package, and
// that is a choice rather than an omission. Two endpoints are used —
// create an order, fetch a payment — and both are a POST and a GET with
// Basic auth. The package would add a dependency, its own retry and
// timeout behaviour, and a second place for the key secret to live, in
// exchange for saving about forty lines. The signature verification the
// package is genuinely useful for lives in payment.policy.js, where it
// is six lines of node:crypto and can be read.
//
// Nothing here decides anything. It makes a call, checks the shape of
// what came back, and raises a typed error. Whether a payment counts is
// payment.service.js's business.

import { env } from "./env.js";
import { GATEWAY_TIMEOUT_MS, MAX_RECEIPT_LENGTH, toMinorUnits } from "./payment.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const API_BASE = "https://api.razorpay.com/v1";

/**
 * Basic auth, built per call rather than cached at module load.
 *
 * The keys are read from `env` each time so that a test can swap them
 * without re-importing this module, and so that importing this file on a
 * backend with no keys configured is harmless — it only fails when
 * something actually tries to call out.
 */
const authHeader = () => {
  const { keyId, keySecret } = env.razorpay;

  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

/**
 * Refuses early, and says which variable is missing.
 *
 * 503 rather than 500: the shop has not broken, it has not finished
 * being set up, and those want different responses from whoever is
 * reading the log.
 */
const assertConfigured = () => {
  if (!env.razorpay.enabled) {
    throw ApiError.serviceUnavailable(
      "Online payment is not available right now.",
      "PAYMENT_NOT_CONFIGURED",
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set on the API.",
    );
  }
};

/**
 * One call to Razorpay.
 *
 * Every failure mode ends as an ApiError, because the alternative is a
 * raw fetch rejection reaching the global handler as a 500 that says
 * "fetch failed" — which tells the shop nothing about whose fault it was.
 *
 * The distinction the status codes draw is deliberate:
 *
 *   502  Razorpay answered, and what it said was not usable. Their
 *        problem, or ours, but the request did complete.
 *   504  Razorpay did not answer inside GATEWAY_TIMEOUT_MS. A shopper is
 *        watching a spinner; this is the one that must not hang.
 */
const call = async (path, { method = "GET", body } = {}) => {
  assertConfigured();

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";

    logger.error("Razorpay request did not complete", {
      path,
      method,
      timedOut,
      error: error?.message,
    });

    if (timedOut) {
      throw ApiError.gatewayTimeout(
        "The payment provider did not respond. Please try again.",
        "PAYMENT_GATEWAY_TIMEOUT",
      );
    }

    throw ApiError.badGateway(
      "Could not reach the payment provider. Please try again.",
      "PAYMENT_GATEWAY_UNREACHABLE",
    );
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Razorpay's shape is { error: { code, description, reason } }.
    const detail = payload?.error?.description ?? `HTTP ${response.status}`;

    logger.error("Razorpay rejected a request", {
      path,
      method,
      status: response.status,
      code: payload?.error?.code,
      description: payload?.error?.description,
    });

    // 401 is ours: the keys are wrong. Saying "try again" would be a
    // lie, and a shopper retrying cannot fix it.
    if (response.status === 401) {
      throw ApiError.serviceUnavailable(
        "Online payment is not available right now.",
        "PAYMENT_CREDENTIALS_REJECTED",
        "Razorpay rejected the API keys.",
      );
    }

    throw ApiError.badGateway(
      "The payment provider refused the request. Please try again.",
      "PAYMENT_GATEWAY_REJECTED",
      detail,
    );
  }

  return payload;
};

export const RazorpayGateway = {
  /** Whether a payment sheet can be opened at all. */
  isEnabled: () => env.razorpay.enabled,

  /** The public key the browser needs to open the checkout sheet. */
  publicKeyId: () => env.razorpay.keyId,

  /**
   * Opens a Razorpay order for one of ours.
   *
   * `receipt` is our order number, which is what makes a Razorpay
   * dashboard row traceable back to a row here without a lookup. It is
   * capped at forty characters by Razorpay, so it is truncated rather
   * than allowed to fail the call — an order number is well inside that
   * and the truncation should never fire.
   *
   * `notes` are free-form and come back on every webhook about this
   * order. Our own order id goes in there so that a delivery can be
   * matched even in the case where the payments row was somehow not
   * written.
   *
   * @param {object} input
   * @param {number} input.amount       in rupees
   * @param {string} input.receipt      the shop's order number
   * @param {Record<string,string>} [input.notes]
   */
  async createOrder({ amount, currency, receipt, notes = {} }) {
    const payload = await call("/orders", {
      method: "POST",
      body: {
        amount: toMinorUnits(amount),
        currency,
        receipt: String(receipt).slice(0, MAX_RECEIPT_LENGTH),
        notes,
        // The money is taken in one step rather than authorised now and
        // captured later. A boutique that ships in ten days has no use
        // for a two-phase capture, and an authorisation left uncaptured
        // expires — silently, into a shopper who believes they have paid.
        payment_capture: 1,
      },
    });

    if (!payload?.id) {
      throw ApiError.badGateway(
        "The payment provider returned an unusable response.",
        "PAYMENT_GATEWAY_MALFORMED",
      );
    }

    return payload;
  },

  /**
   * One payment, by the provider's id.
   *
   * Used to confirm what the browser claimed. The signature already
   * proves the message came from Razorpay, but it says nothing about
   * *amount* — so the service reads the real figure back from here
   * before marking an order paid. See payment.service.js.
   */
  async fetchPayment(paymentId) {
    return call(`/payments/${encodeURIComponent(paymentId)}`);
  },
};
