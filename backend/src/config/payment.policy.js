// src/config/payment.policy.js
//
// The one definition of what a payment attempt may be (F-10).
//
// Sits beside order.policy.js and mirrors its shape for the same reason:
// the validator, the service, the repository and the webhook handler all
// have to agree about these words, and a rule split across four files is
// how a webhook ends up banking money against a status nothing else
// recognises.
//
// The status list here is duplicated as a CHECK constraint in
// 010_create_payments.sql. This module decides which moves are legal; the
// constraint only stops a value nobody defined from reaching the table.

import { createHmac, timingSafeEqual } from "node:crypto";

// ============================================================
// PROVIDERS
// ============================================================

export const PAYMENT_PROVIDER = {
  RAZORPAY: "razorpay",

  /**
   * Money that arrived outside a gateway — a bank transfer the shop saw
   * and confirmed by hand.
   *
   * Kept as a first-class provider rather than a null, because it is not
   * an absence: it is a real way this shop has always been paid, it is
   * what the admin "confirm payment" button records, and a report that
   * has to reconcile against a Razorpay settlement file needs to be able
   * to exclude these rows by name.
   */
  MANUAL: "manual",
};

export const PAYMENT_PROVIDERS = Object.values(PAYMENT_PROVIDER);

export const DEFAULT_PROVIDER = PAYMENT_PROVIDER.RAZORPAY;

// ============================================================
// ATTEMPT STATUS
// ============================================================
//
// Distinct from `orders.payment_status`, which is the order's one-word
// answer to "has this been paid for". These are the states of a single
// attempt, and an order may accumulate several — two failed cards and a
// UPI that worked is three rows and one paid order.

export const PAYMENT_ATTEMPT_STATUS = {
  /** A payment sheet was opened. Says nothing about money. */
  CREATED: "created",

  /** Verified — a checked signature, never an unverified client claim. */
  PAID: "paid",

  FAILED: "failed",

  REFUNDED: "refunded",
};

export const PAYMENT_ATTEMPT_STATUSES = Object.values(PAYMENT_ATTEMPT_STATUS);

/**
 * Where an attempt may go next.
 *
 * `created → paid` is the happy path and `created → failed` the common
 * one. Nothing leaves `failed`: Razorpay issues a new payment id for a
 * retry, so a second try is a second row, not this one changing its mind.
 * A failed attempt that could later become paid would also make the
 * unique constraint on provider_payment_id meaningless.
 */
export const PAYMENT_TRANSITIONS = Object.freeze({
  [PAYMENT_ATTEMPT_STATUS.CREATED]: [
    PAYMENT_ATTEMPT_STATUS.PAID,
    PAYMENT_ATTEMPT_STATUS.FAILED,
  ],
  [PAYMENT_ATTEMPT_STATUS.PAID]: [PAYMENT_ATTEMPT_STATUS.REFUNDED],
  [PAYMENT_ATTEMPT_STATUS.FAILED]: [],
  [PAYMENT_ATTEMPT_STATUS.REFUNDED]: [],
});

export const canTransitionPayment = (from, to) =>
  (PAYMENT_TRANSITIONS[from] ?? []).includes(to);

// ============================================================
// MONEY
// ============================================================
//
// Razorpay's wire format is an integer of the smallest currency unit —
// paise for INR. The database stores rupees as DECIMAL(10,2), matching
// orders.total.
//
// Converted here and nowhere else. The two conversions are the single
// most dangerous arithmetic in this feature: a factor of a hundred in
// either direction is a shopper charged ₹185,000 for a ₹1,850 kurta, and
// nothing downstream would notice, because both numbers are valid.

export const CURRENCY = "INR";

/**
 * Rupees → paise, as an integer.
 *
 * `Math.round`, not a truncation. `1024.09 * 100` is 102408.99999999999
 * in binary floating point, and `Math.trunc` would send Razorpay one
 * paisa less than the order says. It is not most prices — plenty
 * multiply exactly — which is what makes it dangerous: it is a mismatch
 * the shop finds at reconciliation, months later, on one order in a
 * few hundred.
 */
export const toMinorUnits = (rupees) => {
  const amount = Number(rupees);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Cannot convert ${rupees} to paise`);
  }

  return Math.round(amount * 100);
};

/** Paise → rupees, at two places. The inverse of the above. */
export const fromMinorUnits = (paise) => Math.round(Number(paise)) / 100;

// ============================================================
// SIGNATURES
// ============================================================

/**
 * Constant-time comparison of two hex digests.
 *
 * `===` on a signature leaks how many leading characters were right
 * through how long the comparison took. That is a real attack on a
 * public, unauthenticated webhook endpoint that an attacker may call as
 * often as they like — which is exactly what /payments/webhook is.
 *
 * Lengths are compared first and separately: timingSafeEqual throws on a
 * length mismatch, and a mismatched length is not a secret worth
 * protecting — every honest signature from this provider is the same
 * width.
 */
export const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
};

/**
 * The signature Razorpay returns to the browser at the end of checkout.
 *
 * HMAC-SHA256 of "<razorpay_order_id>|<razorpay_payment_id>", keyed with
 * the API secret. This is what makes the client callback trustworthy:
 * the browser is telling us money arrived, and only someone holding the
 * secret could have produced this alongside that claim.
 */
export const expectedCheckoutSignature = ({ orderId, paymentId, secret }) =>
  createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

/**
 * The signature on a webhook delivery.
 *
 * HMAC-SHA256 of the raw request body, keyed with the *webhook* secret —
 * a different secret from the API one, and the reason app.js has to keep
 * an unparsed copy of this route's body. Re-serialising the parsed JSON
 * would reorder keys and change the digest.
 */
export const expectedWebhookSignature = ({ rawBody, secret }) =>
  createHmac("sha256", secret).update(rawBody).digest("hex");

// ============================================================
// WEBHOOK EVENTS
// ============================================================
//
// The three that change something here. Razorpay sends many more and
// they are acknowledged and ignored — a 2xx for an event we do not act
// on, so it is not retried for the next twenty-four hours.

export const WEBHOOK_EVENT = {
  PAYMENT_CAPTURED: "payment.captured",
  PAYMENT_FAILED: "payment.failed",
  REFUND_PROCESSED: "refund.processed",
};

export const HANDLED_WEBHOOK_EVENTS = Object.values(WEBHOOK_EVENT);

// ============================================================
// LIMITS
// ============================================================

/**
 * How long to wait on Razorpay before giving up, in milliseconds.
 *
 * A shopper is watching a spinner on the other end of this call. Ten
 * seconds is long enough for a slow but working gateway and short enough
 * that a hung one produces an error they can act on rather than a tab
 * they close.
 */
export const GATEWAY_TIMEOUT_MS = 10_000;

/** Razorpay's own cap on the `receipt` field. */
export const MAX_RECEIPT_LENGTH = 40;
