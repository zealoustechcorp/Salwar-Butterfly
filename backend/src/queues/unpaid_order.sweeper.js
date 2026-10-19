// src/queues/unpaid_order.sweeper.js
//
// Gives abandoned checkouts' stock back to the shelf.
//
// Starting a checkout holds its pieces at once (see ORDER_STATUS in
// order.policy.js), but an order is not placed until it is paid for. A
// draft still unpaid after env.checkoutHoldMinutes is cancelled here,
// through the same guarded OrderRepository.cancel an admin uses, so the
// stock and the "changed under you" guard behave exactly as they do for
// a person. A draft is cancelled silently — nobody was told it existed.
//
// A payment that lands after the sweep is not lost: PaymentRepository.settle
// re-reserves the pieces if they are still there and places the order, and
// otherwise records the payment as a refund the shop owes.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { ORDER_STATUS } from "../config/order.policy.js";
import { OrderRepository } from "../repository/order.repository.js";
import { logger } from "../utils/logger.js";

// Every minute: the hold is ten, and a piece held for a minute past it
// is a piece somebody else could not buy.
const SWEEP_INTERVAL_MS = 60_000;

const SWEEP_BATCH = 25;

/** @type {NodeJS.Timeout | null} */
let timer = null;

let sweeping = false;

/** One pass. Swallows everything, so the interval never dies. */
export async function sweepUnpaidOrdersOnce() {
  if (sweeping) return 0;

  sweeping = true;

  try {
    const ids = await OrderRepository.findExpiredCheckouts({
      holdMinutes: env.checkoutHoldMinutes,
      limit: SWEEP_BATCH,
    });

    let cancelled = 0;

    for (const id of ids) {
      // Guarded on pending_payment inside the transaction: an order paid
      // or cancelled since the read above is simply skipped.
      const row = await OrderRepository.cancel(id, {
        reason: `Not paid within ${env.checkoutHoldMinutes} minutes`,
        cancellableFrom: [ORDER_STATUS.PENDING_PAYMENT],
      });

      if (row) cancelled += 1;
    }

    if (cancelled > 0) {
      logger.info("Released expired checkouts", { count: cancelled });
    }

    return cancelled;
  } catch (error) {
    logger.error("Unpaid order sweep failed", error);

    Sentry.captureException(error, {
      tags: { feature: "orders", phase: "unpaid-sweep" },
    });

    return 0;
  } finally {
    sweeping = false;
  }
}

/**
 * Called unconditionally from server.js.
 *
 * On in production, off elsewhere unless UNPAID_ORDER_SWEEP=on. Every
 * development machine points at the same shared database, and a sweeper
 * that cancels orders must not run just because somebody started
 * `npm run dev`.
 */
export function startUnpaidOrderSweeper() {
  if (!env.unpaidOrderSweepEnabled) return null;
  if (timer) return timer;

  // Once shortly after boot, then on the interval.
  setTimeout(() => {
    sweepUnpaidOrdersOnce().catch(() => {});
  }, 30_000).unref();

  timer = setInterval(() => {
    sweepUnpaidOrdersOnce().catch(() => {});
  }, SWEEP_INTERVAL_MS);

  timer.unref();

  return timer;
}

export function stopUnpaidOrderSweeper() {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}
