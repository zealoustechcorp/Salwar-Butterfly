// src/queues/payment.reconciler.js
//
// The safety net under the Razorpay webhook: asks Razorpay what it has
// captured and settles anything that never reached us.
//
// A paid order is confirmed by whichever arrives first of the checkout
// return (the shopper's browser) and the payment.captured webhook. Both
// can be lost together: the shopper closes the tab, and the webhook job
// exhausts its retries while Postgres is down (webhook.worker.js gives up
// after ~75 seconds). Nothing then marks the order paid, the unpaid-order
// sweeper releases it ten minutes later, and the shopper has been charged
// for an order that no screen shows.
//
// This closes that gap. Every few minutes it lists the payments Razorpay
// captured in the last LOOKBACK_HOURS, picks out those whose attempt of
// ours is still unsettled, and hands each to PaymentService.onPaymentCaptured
// — the webhook's own handler, so the amount check and the guarded,
// idempotent settle are the same code. A draft the sweeper already
// cancelled is revived if its stock is still there, or recorded as a
// refund the shop owes (see PaymentRepository.settle); either way the
// payment is no longer invisible.
//
// One Razorpay call per page of payments, not one per attempt, so the
// cost stays flat however many checkouts were abandoned. A pass that
// fails (Postgres or Razorpay down) is simply tried again next time, and
// the look-back is long enough to cover an outage measured in hours.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { RazorpayGateway } from "../config/razorpay.gateway.js";
import { PaymentRepository } from "../repository/payment.repository.js";
import { PaymentService } from "../services/payment.service.js";
import { logger } from "../utils/logger.js";

const RECONCILE_INTERVAL_MS = 5 * 60_000;

// How far back each pass looks. Long enough to outlast a bad outage;
// a payment older than this that is still unsettled is a job for a person.
export const LOOKBACK_HOURS = 48;

// Payments younger than this are left to the checkout return and the
// webhook, which normally settle them within seconds. Reconciling them
// too would be harmless (settle is idempotent) but noisy.
export const GRACE_MS = 3 * 60_000;

// Razorpay's maximum page size, and a cap on pages per pass so a
// runaway listing cannot keep one pass going indefinitely.
export const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** @type {NodeJS.Timeout | null} */
let timer = null;

let running = false;

/**
 * Whether this captured payment can be handed to settle. An attempt
 * already marked failed for an amount mismatch on this very payment has
 * been looked at and refused once — re-running it every pass would only
 * repeat the same refusal.
 */
const needsSettling = (attempt, payment) =>
  !(attempt.error_code === "AMOUNT_MISMATCH" && attempt.provider_payment_id === payment.id);

/**
 * One pass. Swallows everything, so the interval never dies.
 *
 * @param {object} [options]
 * @param {number} [options.now] epoch ms, for tests
 * @returns {Promise<{ checked: number, settled: number }>}
 */
export async function reconcilePaymentsOnce({ now = Date.now() } = {}) {
  if (running) return { checked: 0, settled: 0 };
  if (!RazorpayGateway.isEnabled()) return { checked: 0, settled: 0 };

  running = true;

  try {
    const to = (now - GRACE_MS) / 1000;
    const from = (now - LOOKBACK_HOURS * 3_600_000) / 1000;

    const captured = [];

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const items = await RazorpayGateway.listPayments({
        from,
        to,
        count: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });

      for (const item of items) {
        if (item?.status === "captured" && item.order_id && item.id) captured.push(item);
      }

      if (items.length < PAGE_SIZE) break;
    }

    if (captured.length === 0) return { checked: 0, settled: 0 };

    const attempts = await PaymentRepository.findUnsettledByProviderOrderIds([
      ...new Set(captured.map((payment) => payment.order_id)),
    ]);

    const byOrderId = new Map(attempts.map((attempt) => [attempt.provider_order_id, attempt]));

    let settled = 0;

    for (const payment of captured) {
      const attempt = byOrderId.get(payment.order_id);

      if (!attempt || !needsSettling(attempt, payment)) continue;

      // Each payment on its own: one that fails to settle must not stop
      // the rest, and it will be found again on the next pass.
      try {
        const result = await PaymentService.onPaymentCaptured(payment, { source: "reconcile" });

        if (!result?.settled) continue;

        settled += 1;

        // The webhook and the checkout return both missed this payment,
        // which should never happen quietly. A warning, not an error:
        // the money is now accounted for.
        logger.warn("Reconciled a payment the webhook never settled", {
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          alreadyPaid: result.alreadyPaid,
          unmatched: result.unmatched ?? null,
        });

        Sentry.captureMessage("Payment settled by reconciliation", {
          level: "warning",
          tags: { feature: "payments", phase: "reconcile" },
          extra: { providerOrderId: payment.order_id, providerPaymentId: payment.id },
        });
      } catch (error) {
        logger.error("Payment reconciliation could not settle a payment", {
          providerOrderId: payment.order_id,
          providerPaymentId: payment.id,
          message: error?.message,
        });

        Sentry.captureException(error, {
          tags: { feature: "payments", phase: "reconcile" },
        });
      }
    }

    return { checked: captured.length, settled };
  } catch (error) {
    logger.error("Payment reconciliation pass failed", { message: error?.message });

    Sentry.captureException(error, {
      tags: { feature: "payments", phase: "reconcile" },
    });

    return { checked: 0, settled: 0 };
  } finally {
    running = false;
  }
}

/**
 * Called unconditionally from server.js.
 *
 * On in production, off elsewhere unless PAYMENT_RECONCILE=on, for the
 * same reason as the unpaid-order sweeper: it writes to orders, and every
 * development machine points at the same shared database.
 */
export function startPaymentReconciler() {
  if (!env.paymentReconcileEnabled) return null;
  if (timer) return timer;

  // Once shortly after boot — a restart is often the end of the outage
  // this exists for — then on the interval.
  setTimeout(() => {
    reconcilePaymentsOnce().catch(() => {});
  }, 60_000).unref();

  timer = setInterval(() => {
    reconcilePaymentsOnce().catch(() => {});
  }, RECONCILE_INTERVAL_MS);

  timer.unref();

  return timer;
}

export function stopPaymentReconciler() {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}
