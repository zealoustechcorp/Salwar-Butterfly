// src/routes/payment.routes.js
//
// Payment (F-10).
//
// Like orders, this router serves several audiences and so guards itself
// route by route rather than being blanket-mounted behind requireAdmin.
// Three of the five endpoints must be reachable without an admin token,
// and one of them must be reachable with no token at all.
//
// The webhook is the unusual one and deserves its reasons in full:
//
//   - It is unauthenticated, because Razorpay has no token of ours to
//     send. Its credential is an HMAC over the body, checked in
//     payment.service.js against RAZORPAY_WEBHOOK_SECRET.
//
//   - It carries only the global limiter, never the checkout one. A
//     tight limiter here would drop genuine deliveries during a burst —
//     Razorpay retries, but a limiter that fires on the retries too
//     converts a spike into an order that is never confirmed. The
//     signature check is cheap and rejects a forged body before anything
//     touches the database.
//
//   - Its body is parsed as a raw Buffer by app.js, not as JSON, because
//     the signature covers the exact bytes sent.

import express from "express";

import { PaymentController } from "../controllers/payment.controller.js";

import {
  authenticate,
  authenticateOptional,
} from "../middlewares/auth.middleware.js";
import { requireAdmin } from "../middlewares/authorize.middleware.js";
import { checkoutRateLimiter } from "../middlewares/rateLimiter.js";

import {
  validatePaymentOrderIdParam,
  validateVerifyPayment,
} from "../validators/payment.validator.js";

const router = express.Router();

// ============================================================
// PUBLIC
// ============================================================

/**
 * Whether online payment is available.
 *
 * Public and unauthenticated because the checkout page needs it before
 * the shopper has done anything, and because it discloses nothing: a
 * boolean, a provider name and a currency.
 */
router.get("/getPaymentConfig", PaymentController.getConfig);

/** Razorpay, server to server. See the header above. */
router.post("/webhook", PaymentController.webhook);

// ============================================================
// STOREFRONT
// ============================================================

/**
 * Open a payment sheet (F-10.01).
 *
 * `authenticateOptional`, on the same terms as checkout itself: the
 * storefront promises that an order can be placed without an account, so
 * it has to be payable without one too. A guest's claim on their order
 * is the order id; a signed-in shopper's order requires their token, and
 * the service enforces the difference.
 *
 * Behind the checkout limiter because each call opens an order at
 * Razorpay and writes a row here.
 */
router.post(
  "/createPaymentSession/:orderId",
  checkoutRateLimiter,
  authenticateOptional,
  validatePaymentOrderIdParam,
  PaymentController.createSession,
);

/**
 * The checkout return (F-10.02).
 *
 * Unauthenticated for the same reason, and safe to be: the payload is
 * only believed if it carries a signature this server can reproduce with
 * Razorpay's secret. A caller with no signature can achieve nothing here
 * that they could not achieve by not calling it.
 *
 * Rate limited anyway. Signature checking is cheap but the endpoint
 * makes an outbound call to Razorpay on every valid one.
 */
router.post(
  "/verifyPayment",
  checkoutRateLimiter,
  validateVerifyPayment,
  PaymentController.verify,
);

// ============================================================
// ADMIN
// ============================================================

router.get(
  "/getOrderPayments/:orderId",
  authenticate,
  requireAdmin,
  validatePaymentOrderIdParam,
  PaymentController.listForOrder,
);

export default router;
