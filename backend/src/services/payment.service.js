// src/services/payment.service.js
//
// Online payment (F-10).
//
// The rule this whole file exists to enforce, stated once:
//
//   Nothing marks an order paid except a message this API has verified
//   with a secret only Razorpay and this server hold.
//
// The browser is not a source of truth about money. It will tell us a
// payment succeeded, and it may be telling the truth, but the claim
// arrives from a machine the shopper controls. So `verifyCheckout` does
// not believe it: it checks the HMAC Razorpay signed the claim with, and
// then — because a valid signature proves origin and says nothing about
// amount — reads the payment back from Razorpay and compares the figure
// against what the order says it owes.
//
// The three ways a payment can reach us, and why there are three:
//
//   verifyCheckout   the shopper stayed on the page and the checkout
//                    script returned. Fast, and the only path that can
//                    show them a confirmation immediately.
//
//   webhook          Razorpay tells us server-to-server. Slower, and the
//                    only path that survives the shopper closing the tab
//                    at the wrong moment — which is the single most
//                    common way an order ends up paid-but-unconfirmed on
//                    a storefront that only implements the first path.
//
//   admin confirm    a bank transfer the shop saw. Predates the gateway,
//                    still needed, and lives in OrderService.
//
// The first two race, routinely, and both end in
// PaymentRepository.settle, whose guarded UPDATE lets whichever arrives
// second find nothing to do. That is by design and is the reason settle
// reports `alreadyPaid` instead of throwing.

import { PaymentRepository } from "../repository/payment.repository.js";
import { OrderRepository } from "../repository/order.repository.js";
import { PaymentMapper } from "../mapper/payment.mapper.js";
import { OrderMapper } from "../mapper/order.mapper.js";

import { RazorpayGateway } from "../config/razorpay.gateway.js";
import { env } from "../config/env.js";
import { ORDER_STATUS } from "../config/order.policy.js";
import {
  CURRENCY,
  DEFAULT_PROVIDER,
  expectedCheckoutSignature,
  expectedWebhookSignature,
  fromMinorUnits,
  newIdempotencyKey,
  safeCompare,
  SESSION_REUSE_WINDOW_MS,
  WEBHOOK_EVENT,
} from "../config/payment.policy.js";

import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// ============================================================
// HELPERS
// ============================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label) => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * Whether this caller may pay for this order.
 *
 * Mirrors OrderService.assertVisibleTo, with one deliberate difference:
 * an order with no `customer_id` is a guest's, and a guest has no token
 * to prove anything with. Their claim is the order id itself — a v4 UUID
 * handed to their browser at checkout and to nobody else.
 *
 * That is weaker than a token and it is the right trade here. The thing
 * being authorised is *paying*, and the worst an attacker who guessed a
 * UUID could do is settle somebody else's bill. What the response
 * discloses is bounded to match: the session DTO carries the order
 * number, the amount and the contact details the same person just typed
 * in, and nothing else about them.
 *
 * An order that *does* belong to an account is not reachable this way.
 * Once there is a token to check, it is checked.
 */
const assertPayableBy = (order, { customerId = null, isAdmin = false }) => {
  if (isAdmin) return;
  if (!order.customer_id) return;

  if (String(order.customer_id) !== String(customerId)) {
    logger.warn("Payment ownership check failed", {
      orderId: order.id,
      customerId,
    });

    // 404, matching the order routes: "that order exists but is not
    // yours" is itself a disclosure.
    throw ApiError.notFound("Order not found", "ORDER_NOT_FOUND");
  }
};

const loadOrder = async (id) => {
  const order = await OrderRepository.findById(id);

  if (!order) {
    throw ApiError.notFound("Order not found", "ORDER_NOT_FOUND");
  }

  return order;
};

/**
 * Refuses an order that is not waiting for money, and says why.
 *
 * Split out because both entry points need it and because the messages
 * are the ones a shopper reads on the checkout page — "this order has
 * already been paid for" is an answer; "conflict" is not.
 */
const assertAwaitingPayment = (order) => {
  if (order.status === ORDER_STATUS.PENDING_PAYMENT) return;

  if (order.status === ORDER_STATUS.CANCELLED) {
    throw new ApiError(409, "This order was cancelled and cannot be paid for.");
  }

  throw new ApiError(409, "This order has already been paid for.");
};

/**
 * What this order owes, refusing the figures a gateway cannot take.
 *
 * A zero-value order has nothing for a gateway to do, and Razorpay
 * refuses one. Reachable only if the shop ever prices something at
 * nothing, but a 500 from the gateway is a poor way to find that out.
 *
 * Read from `orders.total` and from nowhere else — see createSession.
 */
const payableAmount = (order) => {
  const amount = Number(order.total);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(409, "This order has nothing to pay.");
  }

  return amount;
};

/**
 * Whether an already-open attempt can answer this request instead of a
 * new one.
 *
 * Age is the main question and the reason the window exists, but not
 * the only one. The amount is checked too: an order's total may
 * legitimately be edited while it waits to be paid, and a Razorpay
 * order carries the figure it was created with. Reusing a sheet for
 * ₹1,850 against an order that now reads ₹2,100 would charge the old
 * price and settle it as if it were the new one — a mismatch nothing
 * downstream would catch, because `verifyCheckout` compares the payment
 * against the *attempt*, and the attempt would agree with itself.
 */
const isReusable = (attempt, { amount, currency }) => {
  if (!attempt) return false;

  const age = Date.now() - new Date(attempt.created_at).getTime();

  if (!(age >= 0 && age < SESSION_REUSE_WINDOW_MS)) return false;

  return Number(attempt.amount) === amount && attempt.currency === currency;
};

// ============================================================
// SERVICE
// ============================================================

export const PaymentService = {
  /**
   * Whether the storefront should offer online payment at all.
   *
   * Read by the checkout page before it renders a "Pay now" button, so
   * that a backend with no keys produces a page that tells the shopper
   * how to pay instead of a button that 503s when they press it.
   */
  getConfig() {
    return {
      enabled: RazorpayGateway.isEnabled(),
      provider: DEFAULT_PROVIDER,
      currency: CURRENCY,
    };
  },

  // ==========================================================
  // OPEN A PAYMENT SHEET
  // ==========================================================

  /**
   * Creates a Razorpay order for one of ours and records the attempt
   * (F-10.01).
   *
   * The amount comes from `orders.total` and from nowhere else. There is
   * deliberately no amount in the request: the same rule that makes
   * checkout read prices from the database rather than from the bag
   * applies with more force here, because this figure is what gets
   * charged.
   *
   * A fresh Razorpay order per *attempt*, but not per call.
   *
   * Attempts are cheap, they are the audit trail this feature is for,
   * and reusing a handle whose sheet was abandoned is how a shopper ends
   * up staring at a payment page that Razorpay has already expired. So a
   * shopper who walks away and comes back later gets a new sheet and a
   * new row, and the table keeps its history of "declined twice, then
   * paid by UPI".
   *
   * What that reasoning does not cover is two calls seconds apart, which
   * are not two attempts — they are one attempt counted twice. A
   * double-click, a refresh, a retry on a bad connection. Left alone
   * they each mint a Razorpay order, and the unique constraints on
   * `payments` cannot stop it because they guard the provider's ids and
   * the provider has just issued two different ones. Only one gets paid;
   * the rest sit live on the Razorpay dashboard, matching no settlement,
   * for a human to work through at month end.
   *
   * So a repeat inside SESSION_REUSE_WINDOW_MS is handed the attempt
   * that already exists, and the whole check-then-create runs under an
   * advisory lock on the order — without it, two calls arriving together
   * both look at an empty table and both create. The response is
   * identical either way; nothing upstream can tell a reused session
   * from a new one, and nothing upstream should.
   *
   * The amount comes from `orders.total` and from nowhere else. There is
   * deliberately no amount in the request: the same rule that makes
   * checkout read prices from the database rather than from the bag
   * applies with more force here, because this figure is what gets
   * charged.
   */
  async createSession(orderId, { customerId = null, isAdmin = false } = {}) {
    const id = assertUuid(orderId, "order ID");

    const order = await loadOrder(id);

    // Checked before the lock so that an order that was never payable —
    // the wrong customer's, already paid, cancelled — is refused without
    // making anybody queue. The status half of it is checked again
    // inside, because this answer can be stale by the time the lock is
    // ours; the ownership half cannot change and is not.
    assertPayableBy(order, { customerId, isAdmin });
    assertAwaitingPayment(order);
    payableAmount(order);

    // One key per logical attempt, minted out here so that everything
    // inside the lock — including the repeat of a POST whose answer was
    // lost — carries the same one. See RazorpayGateway.createOrder.
    const idempotencyKey = newIdempotencyKey();

    try {
      return await PaymentRepository.withSessionLock(order.id, async (client) => {
        // Re-read inside the lock. The request that went first may have
        // been the one that got paid, in which case this order stopped
        // awaiting payment while we were waiting our turn.
        const current = await OrderRepository.findById(order.id, { client });

        if (!current) {
          throw ApiError.notFound("Order not found", "ORDER_NOT_FOUND");
        }

        assertAwaitingPayment(current);

        const amount = payableAmount(current);
        const currency = current.currency ?? CURRENCY;

        const open = await PaymentRepository.findLatestOpenAttempt(order.id, {
          client,
        });

        if (isReusable(open, { amount, currency })) {
          logger.info("Payment session reused", {
            orderId: current.id,
            orderNumber: current.order_number,
            providerOrderId: open.provider_order_id,
            ageMs: Date.now() - new Date(open.created_at).getTime(),
          });

          // No gateway call at all — the fastest path and, once a
          // shopper is clicking twice, the common one.
          return PaymentMapper.toSessionDTO({
            payment: open,
            order: current,
            keyId: RazorpayGateway.publicKeyId(),
          });
        }

        const gatewayOrder = await RazorpayGateway.createOrder({
          amount,
          currency,
          receipt: current.order_number,
          idempotencyKey,
          notes: {
            // Echoed back on every webhook about this order. The webhook
            // finds its attempt by provider_order_id; this is what lets a
            // human match a Razorpay dashboard row to a row here when
            // something has gone wrong enough that the lookup did not.
            order_id: current.id,
            order_number: current.order_number,
          },
        });

        const payment = await PaymentRepository.create(
          {
            orderId: current.id,
            provider: DEFAULT_PROVIDER,
            providerOrderId: gatewayOrder.id,
            amount,
            currency,
          },
          { client },
        );

        logger.info("Payment session opened", {
          orderId: current.id,
          orderNumber: current.order_number,
          providerOrderId: gatewayOrder.id,
          amount,
        });

        return PaymentMapper.toSessionDTO({
          payment,
          order: current,
          keyId: RazorpayGateway.publicKeyId(),
        });
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("PaymentService.createSession failed", {
        orderId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Could not start the payment");
    }
  },

  // ==========================================================
  // THE CHECKOUT RETURN
  // ==========================================================

  /**
   * Verifies what the browser reported and banks it (F-10.02).
   *
   * Four checks, in this order, and none is redundant:
   *
   *  1. the signature   proves Razorpay produced this pairing of order
   *                     and payment id. Without it, anyone can POST
   *                     "I paid" with somebody's order id.
   *
   *  2. the attempt     the provider order id must be one we opened.
   *     exists          A signature over an unknown order is either a
   *                     different merchant's or a replay.
   *
   *  3. the gateway's   the signature covers the ids and not the amount,
   *     own record      so a captured ₹1 payment would pass step 1 for a
   *                     ₹1,850 order. This is the check that stops it.
   *
   *  4. settle          guarded, so the webhook arriving at the same
   *                     moment cannot bank it twice.
   *
   * Failures at 1–3 are logged at `warn` with the ids: they are either
   * an attack or a genuine gateway mismatch, and both want to be visible
   * without reading every request.
   */
  async verifyCheckout({ providerOrderId, providerPaymentId, signature }) {
    if (!RazorpayGateway.isEnabled()) {
      throw ApiError.serviceUnavailable(
        "Online payment is not available right now.",
        "PAYMENT_NOT_CONFIGURED",
      );
    }

    // ---- 1. signature ----------------------------------------

    const expected = expectedCheckoutSignature({
      orderId: providerOrderId,
      paymentId: providerPaymentId,
      secret: env.razorpay.keySecret,
    });

    if (!safeCompare(expected, signature)) {
      logger.warn("Payment signature rejected", {
        providerOrderId,
        providerPaymentId,
      });

      throw ApiError.badRequest(
        "We could not verify this payment. Nothing has been charged twice — " +
          "please contact the shop with your order number.",
        "PAYMENT_SIGNATURE_INVALID",
      );
    }

    // ---- 2. an attempt we opened -----------------------------

    const attempt = await PaymentRepository.findByProviderOrderId(providerOrderId);

    if (!attempt) {
      logger.warn("Payment verified against an unknown attempt", {
        providerOrderId,
      });

      throw ApiError.notFound("Payment not found", "PAYMENT_NOT_FOUND");
    }

    // ---- 3. what Razorpay actually holds ---------------------

    const remote = await RazorpayGateway.fetchPayment(providerPaymentId);

    const captured = remote?.status === "captured";
    const paidRupees = fromMinorUnits(remote?.amount ?? 0);
    const owed = Number(attempt.amount);

    if (!captured || paidRupees !== owed) {
      logger.warn("Payment did not match the attempt", {
        providerOrderId,
        providerPaymentId,
        remoteStatus: remote?.status,
        paidRupees,
        owed,
      });

      await PaymentRepository.markFailed(attempt.id, {
        providerPaymentId,
        code: captured ? "AMOUNT_MISMATCH" : (remote?.error_code ?? "NOT_CAPTURED"),
        description: captured
          ? `Captured ₹${paidRupees} against an order for ₹${owed}`
          : (remote?.error_description ?? `Payment status was ${remote?.status}`),
      });

      throw ApiError.badRequest(
        "This payment could not be matched to your order. " +
          "Please contact the shop with your order number.",
        "PAYMENT_MISMATCH",
      );
    }

    // ---- 4. bank it ------------------------------------------

    return PaymentService.settleAttempt(attempt, {
      providerPaymentId,
      method: remote?.method ?? null,
      source: "checkout",
    });
  },

  /**
   * The last step of every verified path, so the ordering of "mark the
   * attempt, confirm the order, reload it for the response" exists once.
   *
   * `alreadyPaid` is a success, not a conflict. It means the other path
   * — webhook or checkout return — got here first, which is the expected
   * outcome of a race this design accepts rather than prevents.
   */
  async settleAttempt(attempt, { providerPaymentId, method, source }) {
    const { payment, alreadyPaid } = await PaymentRepository.settle(attempt.id, {
      providerPaymentId,
      method,
    });

    const order = await OrderRepository.findById(attempt.order_id);

    logger.info("Payment banked", {
      source,
      orderId: attempt.order_id,
      orderNumber: order?.order_number,
      providerPaymentId,
      alreadyPaid,
    });

    return {
      alreadyPaid,
      payment: PaymentMapper.toAdminDTO(payment ?? attempt),
      order: OrderMapper.toCustomerDTO(order),
    };
  },

  // ==========================================================
  // WEBHOOK
  // ==========================================================

  /**
   * The half of a delivery that must happen inside the request.
   *
   * The signature is over the *raw* body, which is why app.js keeps an
   * unparsed copy for this one route. Re-serialising the parsed JSON
   * would reorder keys and produce a different digest, and the endpoint
   * would reject every genuine delivery while accepting nothing — a
   * failure mode that looks like "webhooks don't work" for a week.
   *
   * It is split from the dispatch below because the endpoint is public
   * and unauthenticated: the HMAC is the only thing standing between a
   * forged event and the rest of this file, so it has to be checked at
   * the door, before the delivery is put on a queue that would then
   * retry it faithfully five times. The raw bytes exist only for the
   * duration of the request anyway.
   *
   * Synchronous, and cheap — one HMAC and a JSON.parse. Nothing here
   * touches Postgres; everything that does is in dispatchWebhook.
   *
   * @returns {object} the parsed event body
   */
  verifyWebhook({ rawBody, signature }) {
    const secret = env.razorpay.webhookSecret;

    if (!secret) {
      logger.error("Webhook received but RAZORPAY_WEBHOOK_SECRET is not set");

      throw ApiError.serviceUnavailable(
        "Webhooks are not configured.",
        "WEBHOOK_NOT_CONFIGURED",
      );
    }

    const expected = expectedWebhookSignature({ rawBody, secret });

    if (!safeCompare(expected, signature ?? "")) {
      logger.warn("Webhook signature rejected", {
        bytes: rawBody?.length ?? 0,
      });

      // 400 rather than 401: there is no credential to re-present. It is
      // a malformed or forged delivery, and Razorpay treats both the
      // same way.
      throw ApiError.badRequest("Invalid webhook signature", "WEBHOOK_SIGNATURE_INVALID");
    }

    let body;

    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw ApiError.badRequest("Malformed webhook body", "WEBHOOK_BODY_INVALID");
    }

    logger.info("Webhook received", {
      event: body?.event,
      providerOrderId: body?.payload?.payment?.entity?.order_id,
      providerPaymentId: body?.payload?.payment?.entity?.id,
    });

    return body;
  },

  /**
   * The half that does the work (F-10.03).
   *
   * Called with a body that has already been verified — from the request
   * itself when there is no queue, and from the BullMQ worker when there
   * is. It must therefore stay safe to run twice on the same event: a
   * queue delivers at least once, and Razorpay redelivers on its own
   * account anyway. Every handler below settles through a guarded UPDATE
   * that reports `alreadyPaid` / `alreadyRefunded` rather than banking
   * twice, which is what makes that true.
   *
   * Everything that is not one of the three handled events is
   * acknowledged and ignored. Razorpay retries anything it does not get
   * a 2xx for, repeatedly, for a day; returning an error for an event we
   * simply do not care about would fill the log with our own indifference.
   */
  async dispatchWebhook(body) {
    const event = body?.event;

    switch (event) {
      case WEBHOOK_EVENT.PAYMENT_CAPTURED:
        return PaymentService.onPaymentCaptured(
          body?.payload?.payment?.entity ?? null,
        );

      case WEBHOOK_EVENT.PAYMENT_FAILED:
        return PaymentService.onPaymentFailed(
          body?.payload?.payment?.entity ?? null,
        );

      case WEBHOOK_EVENT.REFUND_PROCESSED:
        return PaymentService.onRefundProcessed(body?.payload?.refund?.entity ?? null);

      default:
        return { handled: false, event: event ?? null };
    }
  },

  /**
   * Verify and process in one go — the inline path.
   *
   * What the endpoint did before there was a queue, and what it still
   * does when no REDIS_URL is configured. Kept as the composition of the
   * two halves so that the fallback cannot drift from the queued path.
   */
  async handleWebhook({ rawBody, signature }) {
    return PaymentService.dispatchWebhook(
      PaymentService.verifyWebhook({ rawBody, signature }),
    );
  },

  /**
   * Money arrived, told to us by Razorpay directly.
   *
   * The amount is checked here too, against our own attempt row, even
   * though the message is signed. The signature proves Razorpay sent it;
   * it does not prove the capture was for the right order, and a
   * mismatch at this point is something the shop must see rather than
   * something to bank quietly.
   */
  async onPaymentCaptured(entity) {
    if (!entity?.order_id || !entity?.id) {
      return { handled: false, reason: "missing ids" };
    }

    const attempt = await PaymentRepository.findByProviderOrderId(entity.order_id);

    if (!attempt) {
      // Not an error: this may be a delivery for a Razorpay order opened
      // by something else on the same account. Acknowledged so it stops
      // being retried.
      logger.warn("Webhook for an unknown attempt", {
        providerOrderId: entity.order_id,
      });

      return { handled: false, reason: "unknown attempt" };
    }

    const paidRupees = fromMinorUnits(entity.amount ?? 0);
    const owed = Number(attempt.amount);

    if (paidRupees !== owed) {
      logger.error("Webhook captured an amount that does not match the order", {
        providerOrderId: entity.order_id,
        providerPaymentId: entity.id,
        paidRupees,
        owed,
      });

      await PaymentRepository.markFailed(attempt.id, {
        providerPaymentId: entity.id,
        code: "AMOUNT_MISMATCH",
        description: `Captured ₹${paidRupees} against an order for ₹${owed}`,
      });

      return { handled: true, settled: false, reason: "amount mismatch" };
    }

    const result = await PaymentService.settleAttempt(attempt, {
      providerPaymentId: entity.id,
      method: entity.method ?? null,
      source: "webhook",
    });

    return { handled: true, settled: true, alreadyPaid: result.alreadyPaid };
  },

  /**
   * An attempt failed.
   *
   * Recorded, and the order is left alone — see
   * PaymentRepository.markFailed for why a declined card must not
   * release the reserved stock.
   */
  async onPaymentFailed(entity) {
    if (!entity?.order_id) return { handled: false, reason: "missing ids" };

    const attempt = await PaymentRepository.findByProviderOrderId(entity.order_id);

    if (!attempt) return { handled: false, reason: "unknown attempt" };

    await PaymentRepository.markFailed(attempt.id, {
      providerPaymentId: entity.id ?? null,
      code: entity.error_code ?? "PAYMENT_FAILED",
      description: entity.error_description ?? null,
    });

    return { handled: true };
  },

  /**
   * Money went back.
   *
   * The refund entity names the *payment* it reverses, not the order, so
   * this is the one path that looks an attempt up by payment id.
   */
  async onRefundProcessed(entity) {
    if (!entity?.payment_id) return { handled: false, reason: "missing ids" };

    const attempt = await PaymentRepository.findByProviderPaymentId(entity.payment_id);

    if (!attempt) {
      logger.warn("Refund webhook for an unknown payment", {
        providerPaymentId: entity.payment_id,
      });

      return { handled: false, reason: "unknown attempt" };
    }

    const { alreadyRefunded } = await PaymentRepository.markRefunded(attempt.id);

    return { handled: true, alreadyRefunded };
  },

  // ==========================================================
  // ADMIN
  // ==========================================================

  /** Every attempt on one order — the payment strip on the order page. */
  async listForOrder(orderId) {
    const id = assertUuid(orderId, "order ID");

    try {
      const rows = await PaymentRepository.listByOrder(id);
      return PaymentMapper.toAdminList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("PaymentService.listForOrder failed", {
        orderId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch the payment history");
    }
  },
};
