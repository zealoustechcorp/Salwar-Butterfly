// src/controllers/payment.controller.js
//
// Payment (F-10).

import { PaymentService } from "../services/payment.service.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createdResponse, okResponse } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

/** Who is asking. The same rule OrderController uses, for the same reason. */
const identify = (req) => {
  const isAdmin = req.user?.typ === ADMIN_TOKEN_TYPE;

  return {
    isAdmin,
    customerId: isAdmin ? null : (req.user?.id ?? null),
  };
};

export const PaymentController = {
  /**
   * GET /api/payments/getPaymentConfig
   *
   * Whether the storefront should render a "Pay now" button at all.
   * Public and cache-free: a key rotation should take effect on the next
   * page load, not on the next CDN expiry.
   */
  getConfig: asyncHandler(async (req, res) => {
    return okResponse({
      res,
      data: PaymentService.getConfig(),
      message: "Payment configuration fetched successfully",
    });
  }),

  /**
   * POST /api/payments/createPaymentSession/:orderId
   *
   * 201, because this really does create something on both sides — a
   * Razorpay order and a row in `payments`.
   */
  createSession: asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const { customerId, isAdmin } = identify(req);

    logger.info("Create payment session endpoint called", {
      orderId,
      guest: !customerId && !isAdmin,
    });

    const session = await PaymentService.createSession(orderId, {
      customerId,
      isAdmin,
    });

    return createdResponse({
      res,
      data: session,
      message: "Payment session created successfully",
    });
  }),

  /**
   * POST /api/payments/verifyPayment
   *
   * The checkout script's callback, relayed by the page.
   *
   * 200 either way once the signature checks out — `alreadyPaid` means
   * the webhook got here first, which is a success from the shopper's
   * side and must not render as an error on the confirmation page.
   */
  verify: asyncHandler(async (req, res) => {
    const { providerOrderId, providerPaymentId, signature } = req.body;

    const result = await PaymentService.verifyCheckout({
      providerOrderId,
      providerPaymentId,
      signature,
    });

    return okResponse({
      res,
      data: result.order,
      message: result.alreadyPaid
        ? "Payment was already confirmed"
        : "Payment verified successfully",
      meta: { payment: result.payment },
    });
  }),

  /**
   * POST /api/payments/webhook
   *
   * Razorpay, server to server.
   *
   * `req.rawBody` is the unparsed buffer app.js kept for this route —
   * the signature is over those exact bytes. Its absence is a
   * configuration error rather than a bad request, so it fails loudly
   * rather than as a rejected signature that would look like Razorpay's
   * fault.
   *
   * Always 200 on anything that verified, including events we do not
   * handle. Razorpay retries a non-2xx for twenty-four hours, and there
   * is nothing to gain from being retried about an event we are
   * deliberately ignoring.
   */
  webhook: asyncHandler(async (req, res) => {
    const result = await PaymentService.handleWebhook({
      rawBody: req.rawBody,
      signature: req.get("x-razorpay-signature"),
    });

    return okResponse({
      res,
      data: result,
      message: "Webhook received",
    });
  }),

  /**
   * GET /api/payments/getOrderPayments/:orderId
   *
   * Every attempt on one order. Admin only — this is where the declines
   * and the gateway's own error text live.
   */
  listForOrder: asyncHandler(async (req, res) => {
    const { orderId } = req.params;

    const payments = await PaymentService.listForOrder(orderId);

    return okResponse({
      res,
      data: payments,
      message: "Payments fetched successfully",
      meta: { count: payments.length },
    });
  }),
};
