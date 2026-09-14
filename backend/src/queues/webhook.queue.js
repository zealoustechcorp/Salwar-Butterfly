// src/queues/webhook.queue.js
//
// The producer half of the Razorpay webhook queue (Item 5).
//
// Why a queue at all: the webhook is the only path that confirms an
// order when the shopper closes the tab at the wrong moment, and until
// now its reliability was tied to Postgres's. A slow database meant a
// slow response, a slow response meant Razorpay recorded the delivery as
// failed, and recovery then happened on Razorpay's schedule — retries
// spread over twenty-four hours — while a shopper who had paid watched
// an order that still said "awaiting payment".
//
// With this in front, the request does three things: verify, enqueue,
// 200. Redis takes the event in a millisecond or two whatever Postgres
// is doing, and a database that comes back after two minutes down is met
// by a retry seconds later rather than hours later.
//
// The queue is an upgrade, not a new dependency to fall over: with no
// REDIS_URL the controller never asks for it and processes inline
// exactly as before.

import { Queue } from "bullmq";

import { env } from "../config/env.js";
import { createRedisConnection } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/withTimeout.js";

/**
 * Shared with the worker, and with nothing else — BullMQ matches a
 * worker to a queue by this string, so a typo in one of two places is a
 * worker that starts cleanly and processes nothing.
 */
export const WEBHOOK_QUEUE_NAME = "razorpay-webhooks";

/** The job's own name, for BullMQ's per-name metrics and UIs. */
export const WEBHOOK_JOB_NAME = "razorpay-event";

/**
 * How a failed job is retried.
 *
 * Five attempts at 5s, 10s, 20s and 40s — about a minute and a quarter
 * of Postgres being unreachable ridden out without anybody noticing,
 * which covers the ordinary causes (a failover, a lock queue, a
 * migration holding a table). Beyond that the job lands in the failed
 * set and the worker raises the alarm; Razorpay's own redelivery remains
 * the outermost net.
 *
 * Completed jobs are kept for a day rather than dropped on completion,
 * because a completed job is still a job id and a job id is what makes a
 * redelivery a duplicate — see enqueueWebhook. A day is Razorpay's
 * redelivery window. The count cap is there so that a busy day cannot
 * turn the completed set into the largest thing in Redis.
 *
 * Failures are kept indefinitely. They are the ones somebody has to look
 * at, and there are never many.
 */
const defaultJobOptions = Object.freeze({
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  removeOnFail: false,
});

/** @type {Queue | null} */
let queue = null;

/** @type {import('ioredis').Redis | null} */
let connection = null;

/**
 * The queue, opened on first use.
 *
 * Lazy for the same reason getRedisClient is: a module that connects at
 * import time connects in the test runner and in every script that
 * happens to import a service. Callers check `env.redis.enabled` first;
 * this throws rather than quietly dialling localhost.
 */
export function getWebhookQueue() {
  if (!env.redis.enabled) {
    throw new Error(
      "getWebhookQueue() called with no REDIS_URL configured — " +
        "check env.redis.enabled first",
    );
  }

  if (queue) return queue;

  // Its own connection, not the shared client: BullMQ issues multi-key
  // Lua scripts and expects to be the only thing on the wire. Because we
  // hand it an instance rather than a URL, BullMQ treats the connection
  // as borrowed and leaves closing it to us — see closeWebhookQueue.
  connection = createRedisConnection("webhook-queue");

  queue = new Queue(WEBHOOK_QUEUE_NAME, {
    connection,
    defaultJobOptions,
  });

  // Without a listener, a Redis error inside BullMQ surfaces as an
  // unhandled 'error' event and ends the process — the opposite of what
  // optional infrastructure is supposed to do.
  queue.on("error", (err) => {
    logger.error("Webhook queue error", { message: err.message });
  });

  return queue;
}

/**
 * Razorpay's event id, made safe to use as a BullMQ job id.
 *
 * BullMQ refuses a custom id containing `:` (it builds Redis keys out of
 * them), and this value arrives in a header — the one part of a delivery
 * the HMAC does not cover, since the signature is over the body alone.
 * So it is treated as untrusted input even though the event it labels
 * has been verified: a bounded charset and a bounded length, or nothing.
 *
 * Nothing, meaning a missing or unusable header, is not an error. The
 * job is queued with an id of BullMQ's choosing and simply does not
 * dedupe — the handlers are idempotent, so the cost of processing the
 * same event twice is a second guarded UPDATE that finds nothing to do.
 */
const toJobId = (eventId) => {
  const id = String(eventId ?? "").trim();

  if (!id || id.length > 128) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;

  return id;
};

/**
 * How long the request will wait for Redis to take the job.
 *
 * There has to be a limit, and it cannot come from ioredis: these
 * connections are configured for BullMQ, which needs
 * `maxRetriesPerRequest: null`, and a command issued on one of those
 * while Redis is unreachable waits in the offline queue indefinitely
 * rather than failing. Waiting indefinitely on a webhook is the exact
 * failure this queue was introduced to remove, so the wait is bounded
 * here and the caller falls back to processing the event inline.
 *
 * Two seconds is far longer than an enqueue takes (one round trip and a
 * small Lua script) and far shorter than Razorpay's patience.
 */
const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * How long shutdown waits for the queue to close politely.
 *
 * Same reasoning, at the other end of the process's life: with Redis
 * gone, `close()` and `quit()` both wait for a connection that is never
 * coming back, and the shutdown path would hang until server.js's
 * ten-second hard exit — killing the Postgres drain and the Sentry
 * flush that were supposed to run after it. A second each, then the
 * socket is dropped.
 */
const CLOSE_TIMEOUT_MS = 1_000;

/**
 * Put a verified event on the queue.
 *
 * The job id is Razorpay's `x-razorpay-event-id`, which is unique per
 * event and repeated on every redelivery of it. BullMQ ignores an add
 * whose id already exists, so a delivery Razorpay decided to send again
 * collapses into the job that is already queued (or already done, for as
 * long as the completed set keeps it). That is a second layer in front
 * of handlers that are idempotent anyway — belt and braces, on the one
 * path in this codebase that moves money.
 *
 * @param {object} event    the parsed, signature-verified body
 * @param {string} eventId  the x-razorpay-event-id header
 */
export async function enqueueWebhook(event, eventId) {
  const jobId = toJobId(eventId);

  const job = await withTimeout(
    getWebhookQueue().add(WEBHOOK_JOB_NAME, event, jobId ? { jobId } : undefined),
    ENQUEUE_TIMEOUT_MS,
    "Enqueue",
  );

  logger.info("Webhook queued", {
    event: event?.event,
    jobId: job.id,
    // Whether that id is Razorpay's event id, and so whether a
    // redelivery of this event would collapse into this job.
    byEventId: Boolean(jobId),
  });

  return job;
}

/**
 * Close the queue during shutdown — after the worker, so that a job
 * being retried on its way out still has somewhere to go.
 *
 * Every step is bounded and every failure ends in `disconnect`, which
 * drops the socket without asking Redis anything. A shutdown path must
 * end.
 */
export async function closeWebhookQueue() {
  const closingQueue = queue;
  const closingConnection = connection;

  queue = null;
  connection = null;

  if (closingQueue) {
    try {
      await withTimeout(closingQueue.close(), CLOSE_TIMEOUT_MS, "Queue close");
    } catch (err) {
      logger.warn("Webhook queue did not close cleanly", { message: err.message });
    }
  }

  // Ours to close: BullMQ treats a connection it was handed rather than
  // asked to create as borrowed, and leaves it open.
  if (closingConnection) {
    try {
      await withTimeout(closingConnection.quit(), CLOSE_TIMEOUT_MS, "Redis quit");
    } catch {
      closingConnection.disconnect();
    }
  }
}
