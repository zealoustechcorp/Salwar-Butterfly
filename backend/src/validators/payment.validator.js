// src/validators/payment.validator.js
//
// Payment (F-10).
//
// Shape checks only. Nothing here decides whether a payment is genuine —
// that is payment.service.js, and it does it with an HMAC. The job of
// this file is to make sure the service is given three strings rather
// than three undefineds, so a malformed callback reads as a 400 instead
// of a signature check quietly running against "undefined".

import { ApiError } from "../utils/ApiError.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Razorpay's handles: `order_xxx`, `pay_xxx`.
 *
 * Loose on the suffix — the length of Razorpay's ids is theirs to change
 * and pinning it would break on the day they do — and strict on the
 * prefix, which is what tells an order id from a payment id when they
 * arrive swapped.
 */
const RAZORPAY_ID = /^[a-z]+_[A-Za-z0-9]{6,}$/;

/** Hex, because it is an HMAC-SHA256 digest and nothing else. */
const HEX_SIGNATURE = /^[a-f0-9]{64}$/i;

const requiredString = (value, label, pattern) => {
  if (typeof value !== "string" || !value.trim()) {
    return `${label} is required`;
  }

  if (pattern && !pattern.test(value.trim())) {
    return `${label} is not in the expected format`;
  }

  return null;
};

// ============================================================
// ORDER ID PARAM
// ============================================================

export const validatePaymentOrderIdParam = (req, res, next) => {
  const id = String(req.params?.orderId ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid order ID format");
  }

  req.params.orderId = id;

  next();
};

// ============================================================
// CHECKOUT RETURN
// ============================================================

/**
 * What Razorpay's checkout script hands back to the page (F-10.02).
 *
 * The field names on the wire are the storefront's camelCase rather than
 * Razorpay's `razorpay_order_id`. The frontend does that translation at
 * the point it receives them, so this API's payloads read like the rest
 * of this API and not like a third party's.
 */
export const validateVerifyPayment = (req, res, next) => {
  const { providerOrderId, providerPaymentId, signature } = req.body ?? {};

  const errors = {};

  const orderError = requiredString(providerOrderId, "Payment order id", RAZORPAY_ID);
  if (orderError) errors.providerOrderId = orderError;

  const paymentError = requiredString(providerPaymentId, "Payment id", RAZORPAY_ID);
  if (paymentError) errors.providerPaymentId = paymentError;

  const signatureError = requiredString(signature, "Signature", HEX_SIGNATURE);
  if (signatureError) errors.signature = signatureError;

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  req.body.providerOrderId = providerOrderId.trim();
  req.body.providerPaymentId = providerPaymentId.trim();
  req.body.signature = signature.trim();

  next();
};
