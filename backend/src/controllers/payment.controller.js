// src/controllers/payment.controller.js
//
// Payment (F-10).

import { PaymentService } from "../services/payment.service.js";
import { ADMIN_TOKEN_TYPE } from "../services/admin.auth.service.js";
import { enqueueWebhook } from "../queues/webhook.queue.js";
import { env } from "../config/env.js";
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
   *
   * Verify, enqueue, 200 — in a couple of milliseconds, whatever
   * Postgres is doing. The signature check stays here, in the request,
   * because it is what stops a forged event from entering a queue that
   * would then retry it faithfully; everything after it moves to the
   * worker, where a failure costs a retry in seconds instead of a 500
   * that Razorpay redelivers whenever it feels like it.
   *
   * With no REDIS_URL there is no queue, and the delivery is processed
   * inline exactly as it was before there was one. Same again if Redis
   * is configured but unreachable: the queue is an upgrade to this
   * endpoint, and an upgrade that takes payment confirmation down when
   * the cache goes away would be a poor trade.
   */
  webhook: asyncHandler(async (req, res) => {
    const signature = req.get("x-razorpay-signature");

    if (!env.redis.enabled) {
      const result = await PaymentService.handleWebhook({
        rawBody: req.rawBody,
        signature,
      });

      return okResponse({
        res,
        data: result,
        message: "Webhook received",
      });
    }

    const event = PaymentService.verifyWebhook({
      rawBody: req.rawBody,
      signature,
    });

    try {
      const job = await enqueueWebhook(event, req.get("x-razorpay-event-id"));

      return okResponse({
        res,
        data: { queued: true, jobId: job.id },
        message: "Webhook received",
      });
    } catch (error) {
      // Redis is down. The event is verified and in hand, so the worst
      // option would be to drop it; processing it here costs this
      // request whatever Postgres costs, which is what every delivery
      // cost until this queue existed.
      logger.error("Webhook could not be queued — processing inline", {
        event: event?.event,
        message: error?.message,
      });
    }

    const result = await PaymentService.dispatchWebhook(event);

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
