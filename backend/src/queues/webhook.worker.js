// src/queues/webhook.worker.js
//
// The consumer half of the Razorpay webhook queue (Item 5).
//
// Everything the HTTP handler used to do after checking the signature
// happens here instead: find the attempt, reconcile the amount, settle
// the order. The difference is what happens when it fails. Inline, a
// failure was a 500 to Razorpay and a retry on Razorpay's schedule —
// somewhere in the next twenty-four hours. Here it is a retry on ours,
// seconds later, with Razorpay none the wiser.
//
// Runs inside the API process for now. The deployment is a single
// instance and one process to run and monitor is worth more than the
// isolation a second one would buy; nothing in this file assumes that,
// so hosting it in a dedicated process later is a matter of importing
// startWebhookWorker from a new entry point.

import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { createRedisConnection } from "../config/redis.js";
import { PaymentService } from "../services/payment.service.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/withTimeout.js";
import { WEBHOOK_QUEUE_NAME } from "./webhook.queue.js";

/** @type {Worker | null} */
let worker = null;

/** @type {import('ioredis').Redis | null} */
let connection = null;

/**
 * Everything a human would need to find this event, on Razorpay's
 * dashboard and in our own tables, from a log line alone.
 */
const jobContext = (job) => ({
  jobId: job?.id,
  event: job?.data?.event,
  providerOrderId: job?.data?.payload?.payment?.entity?.order_id ?? null,
  providerPaymentId: job?.data?.payload?.payment?.entity?.id ?? null,
});

/**
 * Whether this failure was the last one — the difference between "will
 * be retried in ten seconds" and "this payment event has been dropped".
 */
const isExhausted = (job) =>
  Boolean(job) && job.attemptsMade >= (job.opts?.attempts ?? 1);

/**
 * Start processing queued webhooks.
 *
 * A no-op without Redis, so server.js can call it unconditionally: with
 * no REDIS_URL nothing was ever queued and the controller is processing
 * deliveries inline.
 */
export function startWebhookWorker() {
  if (!env.redis.enabled) return null;
  if (worker) return worker;

  // A worker's own connection cannot be shared with anything that
  // expects an answer: it spends its life blocked on a command waiting
  // for the next job. createRedisConnection is the factory that exists
  // for this — `maxRetriesPerRequest: null`, which BullMQ requires and
  // refuses to start without.
  connection = createRedisConnection("webhook-worker");

  worker = new Worker(
    WEBHOOK_QUEUE_NAME,
    // The whole job. Throwing is the retry protocol: BullMQ reschedules
    // anything that rejects and keeps whatever returns.
    (job) => PaymentService.dispatchWebhook(job.data),
    {
      connection,

      // One at a time, deliberately. Webhooks arrive at the rate a small
      // shop takes payments, so there is nothing to gain from
      // parallelism, and processing them in order keeps a capture and
      // the refund that follows it in the order Razorpay sent them.
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    logger.info("Webhook processed", { ...jobContext(job), result });
  });

  worker.on("failed", (job, err) => {
    if (!isExhausted(job)) {
      // Ordinary: Postgres blinked and the job is already scheduled to
      // come round again. Worth a line — a run of these is what an
      // outage looks like from here — but not an alarm.
      logger.warn("Webhook job failed, will retry", {
        ...jobContext(job),
        attempt: job?.attemptsMade,
        message: err?.message,
      });

      return;
    }

    // The one log line in this feature that must never be missed: a
    // verified payment event that this system has given up on. The order
    // is, most likely, paid and still unconfirmed. Razorpay's own
    // redelivery may yet save it; nobody should be relying on that
    // without knowing it happened.
    logger.error("Webhook job failed permanently — payment event dropped", {
      ...jobContext(job),
      attempts: job?.attemptsMade,
      message: err?.message,
    });

    Sentry.withScope((scope) => {
      scope.setLevel("fatal");
      scope.setTag("queue", WEBHOOK_QUEUE_NAME);
      scope.setContext("webhook", jobContext(job));
      Sentry.captureException(err);
    });
  });

  // Redis itself went away. BullMQ reconnects on its own; this listener
  // is what stops the error event from ending the process while it does.
  worker.on("error", (err) => {
    logger.error("Webhook worker error", { message: err?.message });
  });

  logger.info("Webhook worker started", { queue: WEBHOOK_QUEUE_NAME });

  return worker;
}

/**
 * How long shutdown waits for the job in hand.
 *
 * `close()` lets the current job finish, which is what we want and not
 * something to wait on forever: if Redis is the thing that has gone
 * away, it never returns at all, and server.js's ten-second hard exit
 * would then fire before the Postgres drain and the Sentry flush that
 * are supposed to follow this.
 *
 * Cutting a job off is safe, which is what makes the bound acceptable.
 * A job left active is redelivered once its lock lapses, and the
 * transaction inside settle either committed or it did not.
 */
const CLOSE_TIMEOUT_MS = 2_000;
const QUIT_TIMEOUT_MS = 1_000;

/**
 * Stop processing, letting the job in hand finish.
 *
 * Closed first among the Redis things at shutdown, and before the
 * database pool drains — a worker that loses Postgres mid-job would fail
 * the job and spend an attempt on a process that is going away.
 */
export async function stopWebhookWorker() {
  const closingWorker = worker;
  const closingConnection = connection;

  worker = null;
  connection = null;

  if (closingWorker) {
    try {
      await withTimeout(closingWorker.close(), CLOSE_TIMEOUT_MS, "Worker close");
    } catch (err) {
      logger.warn("Webhook worker did not close cleanly", {
        message: err?.message,
      });
    }
  }

  // BullMQ closes the blocking connection it duplicated for itself, but
  // the one handed to it is ours to close — see closeWebhookQueue.
  if (closingConnection) {
    try {
      await withTimeout(closingConnection.quit(), QUIT_TIMEOUT_MS, "Redis quit");
    } catch {
      closingConnection.disconnect();
    }
  }
}
