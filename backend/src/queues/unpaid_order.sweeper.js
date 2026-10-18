// src/queues/unpaid_order.sweeper.js
//
// Gives abandoned checkouts' stock back to the shelf.
//
// Placing an order reserves its pieces at once (see ORDER_STATUS in
// order.policy.js), and until this existed only a cancellation returned
// them. A guest cannot cancel and a declined card deliberately leaves the
// order alone, so one abandoned checkout could hide the last piece of a
// size until somebody noticed it on the admin queue. This cancels orders
// still unpaid after env.unpaidOrderTtlHours, through the same guarded
// OrderRepository.cancel an admin uses — so stock, notification and the
// "changed under you" guard all behave exactly as they do for a person.
//
// A payment that lands after the sweep is not lost: PaymentRepository.settle
// records it and the order reads as refund-due.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { ORDER_STATUS } from "../config/order.policy.js";
import { OrderRepository } from "../repository/order.repository.js";
import { logger } from "../utils/logger.js";

const SWEEP_INTERVAL_MS = 10 * 60_000;

const SWEEP_BATCH = 25;

/** A sheet opened this recently means somebody may be paying now. */
const ACTIVE_PAYMENT_WINDOW_MINUTES = 30;

/** @type {NodeJS.Timeout | null} */
let timer = null;

let sweeping = false;

/** One pass. Swallows everything, so the interval never dies. */
export async function sweepUnpaidOrdersOnce() {
  if (sweeping) return 0;

  sweeping = true;

  try {
    const ids = await OrderRepository.findStaleUnpaid({
      ttlHours: env.unpaidOrderTtlHours,
      activeWithinMinutes: ACTIVE_PAYMENT_WINDOW_MINUTES,
      limit: SWEEP_BATCH,
    });

    let cancelled = 0;

    for (const id of ids) {
      // Guarded on pending_payment inside the transaction: an order paid
      // or cancelled since the read above is simply skipped.
      const row = await OrderRepository.cancel(id, {
        reason: `Not paid within ${env.unpaidOrderTtlHours} hours`,
        cancellableFrom: [ORDER_STATUS.PENDING_PAYMENT],
      });

      if (row) cancelled += 1;
    }

    if (cancelled > 0) {
      logger.info("Cancelled unpaid orders", { count: cancelled });
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

  // Once shortly after boot, then on the interval — a deploy should not
  // postpone the first sweep by ten minutes.
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
