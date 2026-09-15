// src/queues/notification.sweeper.js
//
// The floor under the notification feature.
//
// Everything else that sends a WhatsApp is an optimisation. This is the
// thing that guarantees a committed outbox row eventually goes out, and
// it runs on every deployment whether or not Redis is configured.
//
// It catches four different failures, which is why it is worth its fifty
// lines rather than being replaced by a queue:
//
//   - no REDIS_URL at all, which this codebase treats as a supported
//     deployment rather than a broken one;
//   - a process killed between the COMMIT that wrote the row and the
//     dispatch that was about to send it;
//   - a process killed mid-call, leaving a row stuck in `sending`;
//   - a retryable failure — a Meta throttle, a 5xx — whose backoff has
//     since expired.
//
// It is deliberately not a BullMQ worker. A queue is the right tool for
// the webhook path, where a job is the only record that the event
// happened; here the record is a durable row in Postgres, and a poll
// over an indexed partial set is both simpler and impossible to lose.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { NotificationRepository } from "../repository/notification.repository.js";
import { NotificationService } from "../services/notification.service.js";
import { logger } from "../utils/logger.js";

/**
 * How often to look.
 *
 * A minute. The dispatch on the emit path already sends the ordinary
 * case within a second or two, so this interval only governs how late a
 * message is in the cases listed above — and a notification that arrives
 * sixty seconds late is indistinguishable from an instant one.
 */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * The most rows one pass will take.
 *
 * Bounded so that a backlog is drained over several minutes rather than
 * in one burst that trips Meta's rate limit and turns every message into
 * a throttled retry.
 */
const SWEEP_BATCH = 25;

/** @type {NodeJS.Timeout | null} */
let timer = null;

/** True while a pass is running, so two never overlap. */
let sweeping = false;

/**
 * One pass. Exported for tests and for a manual nudge; the interval
 * below is what calls it in the running API.
 *
 * Swallows everything. A sweep that throws would take down the interval
 * that schedules it, and the feature would go quiet in a way nobody
 * would notice until a customer asked.
 *
 * @returns {Promise<number>} how many rows were picked up
 */
export async function sweepNotificationsOnce() {
  if (!env.whatsapp.enabled) return 0;
  if (sweeping) return 0;

  sweeping = true;

  try {
    const due = await NotificationRepository.findDue(SWEEP_BATCH);

    if (due.length === 0) return 0;

    logger.debug("Sweeping unsent notifications", { count: due.length });

    // Sequential, not Promise.all. These are already late; there is
    // nothing to gain from sending them all in the same millisecond, and
    // something to lose — Meta's rate limiter treats a burst as a burst
    // whatever the reason for it.
    for (const id of due) {
      await NotificationService.deliver(id);
    }

    return due.length;
  } catch (error) {
    logger.error("Notification sweep failed", error);

    Sentry.captureException(error, {
      tags: { feature: "whatsapp-notifications", phase: "sweep" },
    });

    return 0;
  } finally {
    sweeping = false;
  }
}

/**
 * Begin sweeping.
 *
 * Called unconditionally from server.js. A no-op when WhatsApp is not
 * configured, because there is nothing in the outbox to drain — every
 * row written on such a deployment is already `skipped`.
 */
export function startNotificationSweeper() {
  if (!env.whatsapp.enabled) return null;
  if (timer) return timer;

  timer = setInterval(() => {
    sweepNotificationsOnce().catch(() => {});
  }, SWEEP_INTERVAL_MS);

  // Unref'd so a sweep that is merely scheduled never holds the process
  // open during shutdown — the same courtesy sweepExpiredSessions pays.
  timer.unref();

  return timer;
}

/**
 * Stop sweeping. Synchronous — there is nothing to drain, because a pass
 * in flight is a handful of sends that will finish or be picked up again
 * by the next process.
 */
export function stopNotificationSweeper() {
  if (!timer) return;

  clearInterval(timer);
  timer = null;
}
