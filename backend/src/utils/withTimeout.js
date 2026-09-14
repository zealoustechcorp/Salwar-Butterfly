// src/utils/withTimeout.js

/**
 * Reject a promise that takes too long, so the caller can do something
 * else.
 *
 * Written for the webhook queue (src/queues), where every wait is on
 * Redis and Redis is optional infrastructure. Its connections are
 * configured the way BullMQ requires — `maxRetriesPerRequest: null` —
 * and a command issued on one of those while the server is unreachable
 * does not fail: ioredis holds it in the offline queue and keeps
 * reconnecting, indefinitely. That is the right behaviour for a worker
 * waiting on the next job and the wrong one for a request that has to
 * answer Razorpay, or for a shutdown that has to end.
 *
 * The underlying promise is not cancelled — nothing in Node can cancel
 * it — so callers must be safe with the work happening anyway, late.
 * For an enqueue that means a job that turns up after the event was
 * already processed inline, which the idempotent handlers absorb.
 *
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]  what timed out, for the error message
 * @returns {Promise<T>}
 * @template T
 */
export const withTimeout = (promise, ms, label = "Operation") =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );

    // Settling twice is a no-op, so the late result of a timed-out
    // promise is discarded rather than throwing — and a late *rejection*
    // is still handled here, which is what keeps it from surfacing as an
    // unhandled rejection.
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
