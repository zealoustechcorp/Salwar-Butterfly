// src/config/razorpay.gateway.js
//
// The Razorpay REST client (F-10).
//
// Sits beside r2.storage.js and does the same job: it is the only
// file in the project that knows a third party's wire format, so the
// service above it talks in rupees and order ids and never in paise,
// Basic auth headers or `rzp_` prefixes.
//
// Written against `fetch` rather than the `razorpay` npm package, and
// that is a choice rather than an omission. Two endpoints are used —
// create an order, fetch a payment — and both are a POST and a GET with
// Basic auth. The package would add a dependency, its own timeout
// behaviour, and a second place for the key secret to live, in exchange
// for saving about forty lines. The signature verification the package
// is genuinely useful for lives in payment.policy.js, where it is six
// lines of node:crypto and can be read.
//
// What the package *would* have given us for free is retries, so this
// file grows its own — deliberately, and in the same shape as the
// deadlock retry in db.js: a named set of failures is tried again,
// everything else goes straight up. There is a circuit breaker too. The
// reasoning for both sits above `isRetryable` and `enterBreaker`; the
// short version is that the worst moment this codebase can produce is a
// shopper who has already been charged being told the payment failed,
// and before this a single dropped packet was enough to produce it.
//
// Nothing here decides anything. It makes a call, checks the shape of
// what came back, and raises a typed error. Whether a payment counts is
// payment.service.js's business.

import { env } from "./env.js";
import { GATEWAY_TIMEOUT_MS, MAX_RECEIPT_LENGTH, toMinorUnits } from "./payment.policy.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const API_BASE = "https://api.razorpay.com/v1";

// ============================================================
// RETRY POLICY
// ============================================================

/**
 * How long to wait before each retry. Two entries means three attempts
 * at most, which is the point at which "a packet was dropped" stops
 * being the likely explanation.
 *
 * The jitter is there for the same reason as the one in db.js: without
 * it, every request that failed during the same blip comes back at the
 * same millisecond and blips it again.
 */
const RETRY_BACKOFF_MS = [300, 900];
const RETRY_JITTER_MS = 200;

/**
 * The ceiling on one `call()` — every attempt, every pause between them.
 *
 * A shopper is watching a spinner on the other end of this, and the
 * whole reason GATEWAY_TIMEOUT_MS exists is that the wait has to end.
 * Retries must not quietly turn a bounded ten seconds into an unbounded
 * thirty, so each attempt gets the smaller of GATEWAY_TIMEOUT_MS and
 * whatever is left of this budget.
 */
const CALL_BUDGET_MS = 25_000;

/**
 * Below this much remaining budget, another attempt is not worth
 * starting: it would be given a timeout too short for a gateway that is
 * merely slow, and would fail for the wrong reason.
 */
const MIN_ATTEMPT_MS = 2_000;

// ============================================================
// CIRCUIT BREAKER POLICY
// ============================================================

/** Consecutive unwell calls before the breaker opens. */
const BREAKER_THRESHOLD = 5;

/** How long it stays open before one probe is let through. */
const BREAKER_COOLDOWN_MS = 30_000;

// ============================================================
// FAILURE TAXONOMY
// ============================================================

/**
 * Why an attempt failed. Two questions are asked of every failure and
 * this is what answers both:
 *
 *   unsent     the request provably never left this process — DNS did
 *              not resolve, the connection was refused. Nothing happened
 *              at Razorpay, so anything may be tried again.
 *   timeout    no answer inside the deadline. The request may well have
 *              arrived and been acted on; we simply do not know.
 *   network    the connection broke mid-flight. Same unknown as above.
 *   unhealthy  Razorpay answered 429 or 5xx. It is up, but it is not
 *              well, and the same request a moment later may work.
 *   unreadable a 2xx whose body could not be read — the deadline fell in
 *              the middle of the stream, or what arrived was not JSON.
 *   rejected   any other non-2xx. Razorpay considered the request and
 *              said no. That is a decision, not a failure.
 */
const FAILURE = Object.freeze({
  UNSENT: "unsent",
  TIMEOUT: "timeout",
  NETWORK: "network",
  UNHEALTHY: "unhealthy",
  UNREADABLE: "unreadable",
  REJECTED: "rejected",
});

/**
 * `fetch` reports a transport failure as a TypeError whose `cause` is
 * the real socket error. These are the codes that mean the request had
 * not been sent when it died.
 */
const UNSENT_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

/**
 * Whether a failed attempt may be made again.
 *
 * Two rules, and the second is the one that matters:
 *
 * A `rejected` is never retried. A 400 or a 401 will say exactly the
 * same thing the second time, and the only thing a retry buys is ten
 * more seconds of a shopper's patience spent on an answer that cannot
 * change. This is the rule db.js already applies to Postgres: a
 * checkout refused for want of stock is a decision, and running it
 * again does not change it.
 *
 * A POST is retried only when the request provably never went out.
 * `fetchPayment` is a GET and reading a payment twice costs nothing, so
 * it retries freely. `createOrder` is a POST, and a timed-out POST may
 * mean Razorpay created the order and the answer was lost on the way
 * back — retrying that blind opens a second order against the same
 * shopper. `createOrder` now sends an idempotency key, which is what
 * would make lifting this safe, but only if Razorpay honours it on this
 * endpoint — and that is not something their documentation is clear
 * enough about to bet a duplicate order on. The restriction stays; the
 * key is the belt and this is the braces.
 *
 * `unreadable` falls out of those two rules in the right place. Reading
 * a payment again when the first body arrived in pieces costs nothing
 * and is the whole point; re-POSTing an order whose 200 we failed to
 * read would duplicate an order Razorpay has definitely already made.
 *
 * @param {string} kind   one of FAILURE
 * @param {string} method the HTTP method that failed
 */
const isRetryable = (kind, method) => {
  if (kind === FAILURE.REJECTED) return false;

  if (kind === FAILURE.UNSENT) return true;

  return method === "GET";
};

/**
 * Whether a finished attempt is evidence that the gateway itself is in
 * trouble, as opposed to evidence that it is alive and disagreeing with
 * us. Only the former feeds the breaker — a shop with a typo in its key
 * id would otherwise trip it on the fifth rejected call and stay down.
 */
const saysGatewayIsUnwell = (kind) => kind !== FAILURE.REJECTED;

// ============================================================
// CIRCUIT BREAKER STATE
// ============================================================
//
// Module-level, so it is per process. Two API instances behind a load
// balancer keep separate counts, which is the right trade for forty
// lines: a shared count would need a round trip to somewhere to make a
// decision whose entire purpose is to avoid round trips.

/** Unwell calls since the last sign of life. */
let consecutiveFailures = 0;

/** When the breaker opened, or null while it is closed. */
let openedAt = null;

/** True while the one half-open probe is in flight. */
let probing = false;

const breakerIsOpen = () => openedAt !== null;

/**
 * Puts the breaker back to cold. For tests only.
 *
 * The state above is per process and deliberately so, which leaves a
 * test suite no way to start a case from a known position — and a
 * breaker tripped by the previous test is exactly the sort of shared
 * state that makes a suite fail in one order and pass in another.
 * Nothing in the running API calls this.
 */
export const resetGatewayBreaker = () => {
  consecutiveFailures = 0;
  openedAt = null;
  probing = false;
};

/**
 * The gate every call passes through before it is allowed to dial out.
 *
 * Retries answer the dropped packet. This answers the opposite case:
 * Razorpay being genuinely down for minutes. Without it, every checkout
 * during an outage waits out the full budget before failing, and a busy
 * evening turns into a heap of requests all doing nothing slowly. With
 * it, the fifth consecutive failure stops the dialling altogether and
 * the sixth shopper is told "unavailable" in a millisecond instead of
 * twenty-five seconds — which is both a better answer and one that
 * leaves the API responsive for browsing, carts and the manual-payment
 * path that does not need Razorpay at all.
 *
 * Returns true when this call is the half-open probe, so the caller
 * knows to release the probe slot afterwards.
 *
 * @throws {ApiError} when the breaker is open and this call must not go out
 */
const enterBreaker = ({ path, method }) => {
  if (!breakerIsOpen()) return false;

  const cooled = Date.now() - openedAt >= BREAKER_COOLDOWN_MS;

  // One probe at a time: the point of the cooldown is not to hand a
  // struggling gateway the whole backlog the moment it expires.
  if (!cooled || probing) {
    logger.debug("Razorpay call short-circuited by the circuit breaker", {
      path,
      method,
    });

    throw ApiError.badGateway(
      "Could not reach the payment provider. Please try again.",
      "PAYMENT_GATEWAY_UNREACHABLE",
      "The payment provider is failing; calls are paused for a moment.",
    );
  }

  probing = true;

  return true;
};

/** Razorpay answered something — anything. Whatever it said, it is up. */
const recordAlive = () => {
  if (breakerIsOpen()) {
    logger.info("Razorpay circuit breaker closed", {
      downForMs: Date.now() - openedAt,
    });

    openedAt = null;
  }

  consecutiveFailures = 0;
};

/**
 * The gateway failed in a way that says it is unwell.
 *
 * Logged at `error` on the transition only, never per call: an outage
 * should read as one event in the log and in Sentry rather than as
 * several hundred identical timeouts.
 */
const recordUnwell = ({ wasProbe, path, method }) => {
  consecutiveFailures += 1;

  if (breakerIsOpen()) {
    if (wasProbe) {
      openedAt = Date.now();

      logger.error("Razorpay circuit breaker probe failed; staying open", {
        path,
        method,
        cooldownMs: BREAKER_COOLDOWN_MS,
      });
    }

    return;
  }

  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    openedAt = Date.now();

    logger.error("Razorpay circuit breaker opened", {
      path,
      method,
      consecutiveFailures,
      cooldownMs: BREAKER_COOLDOWN_MS,
    });
  }
};

// ============================================================
// REQUEST
// ============================================================

/**
 * Basic auth, built per call rather than cached at module load.
 *
 * The keys are read from `env` each time so that a test can swap them
 * without re-importing this module, and so that importing this file on a
 * backend with no keys configured is harmless — it only fails when
 * something actually tries to call out.
 */
const authHeader = () => {
  const { keyId, keySecret } = env.razorpay;

  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

/**
 * Refuses early, and says which variable is missing.
 *
 * 503 rather than 500: the shop has not broken, it has not finished
 * being set up, and those want different responses from whoever is
 * reading the log.
 */
const assertConfigured = () => {
  if (!env.razorpay.enabled) {
    throw ApiError.serviceUnavailable(
      "Online payment is not available right now.",
      "PAYMENT_NOT_CONFIGURED",
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set on the API.",
    );
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One HTTP exchange with Razorpay.
 *
 * Returns rather than throws, because the caller has to look at *why*
 * this failed before deciding whether to throw at all — and an error
 * carrying its own classification is an error everyone downstream has
 * to remember to unwrap.
 *
 * The errors it builds are unchanged from before the retry loop
 * existed, and the distinction they draw is deliberate:
 *
 *   502  Razorpay answered, and what it said was not usable. Their
 *        problem, or ours, but the request did complete.
 *   504  Razorpay did not answer inside the deadline. A shopper is
 *        watching a spinner; this is the one that must not hang.
 *
 * @returns {{ok: true, payload: unknown}
 *          |{ok: false, kind: string, http: boolean, error: ApiError, meta: object}}
 */
const attemptOnce = async (path, { method, body, headers = {}, timeoutMs }) => {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";

    if (timedOut) {
      return {
        ok: false,
        kind: FAILURE.TIMEOUT,
        http: false,
        error: ApiError.gatewayTimeout(
          "The payment provider did not respond. Please try again.",
          "PAYMENT_GATEWAY_TIMEOUT",
        ),
        meta: { timedOut: true, error: error?.message },
      };
    }

    // The socket error hides one level down: `fetch` reports every
    // transport failure as the same bare "fetch failed" TypeError.
    const code = error?.cause?.code ?? error?.code;

    return {
      ok: false,
      kind: UNSENT_ERROR_CODES.has(code) ? FAILURE.UNSENT : FAILURE.NETWORK,
      http: false,
      error: ApiError.badGateway(
        "Could not reach the payment provider. Please try again.",
        "PAYMENT_GATEWAY_UNREACHABLE",
      ),
      meta: { timedOut: false, code, error: error?.message },
    };
  }

  let payload = null;
  let unreadable = false;

  try {
    payload = await response.json();
  } catch {
    // The status line arrived and the body did not, or did not parse.
    unreadable = true;
  }

  if (response.ok) {
    // A 2xx we cannot read is not a success, and treating it as one is
    // how a paid shopper gets told their payment failed: `fetchPayment`
    // would hand `null` to payment.service.js, which reads that as "not
    // captured" and writes a FAILED row against money that did move.
    // Better to admit we do not know — the retry usually settles it,
    // and the webhook is there for when it does not.
    //
    // Reachable exactly when it hurts most: AbortSignal.timeout covers
    // the body stream too, so a gateway that answers quickly and then
    // sends slowly lands here.
    if (unreadable || payload === null) {
      return {
        ok: false,
        kind: FAILURE.UNREADABLE,
        http: true,
        error: ApiError.badGateway(
          "The payment provider returned an unusable response.",
          "PAYMENT_GATEWAY_MALFORMED",
        ),
        meta: { status: response.status, unreadable },
      };
    }

    return { ok: true, payload };
  }

  // Razorpay's shape is { error: { code, description, reason } }.
  const detail = payload?.error?.description ?? `HTTP ${response.status}`;

  const meta = {
    status: response.status,
    code: payload?.error?.code,
    description: payload?.error?.description,
  };

  // 401 is ours: the keys are wrong. Saying "try again" would be a
  // lie, and a shopper retrying cannot fix it.
  if (response.status === 401) {
    return {
      ok: false,
      kind: FAILURE.REJECTED,
      http: true,
      error: ApiError.serviceUnavailable(
        "Online payment is not available right now.",
        "PAYMENT_CREDENTIALS_REJECTED",
        "Razorpay rejected the API keys.",
      ),
      meta,
    };
  }

  const unwell = response.status === 429 || response.status >= 500;

  return {
    ok: false,
    kind: unwell ? FAILURE.UNHEALTHY : FAILURE.REJECTED,
    http: true,
    error: ApiError.badGateway(
      "The payment provider refused the request. Please try again.",
      "PAYMENT_GATEWAY_REJECTED",
      detail,
    ),
    meta,
  };
};

/**
 * A retried attempt is a `warn` with its number on it; the one that
 * finally gives up keeps the two messages this file has always logged,
 * so an existing log search still finds it.
 */
const logFailure = (result, { path, method, attempt, willRetry }) => {
  const meta = { path, method, attempt, kind: result.kind, ...result.meta };

  if (willRetry) {
    logger.warn("Razorpay call failed, retrying", meta);
    return;
  }

  if (result.http) {
    logger.error("Razorpay rejected a request", meta);
    return;
  }

  logger.error("Razorpay request did not complete", meta);
};

/**
 * One call to Razorpay, retried and breaker-guarded.
 *
 * Every failure mode ends as an ApiError, because the alternative is a
 * raw fetch rejection reaching the global handler as a 500 that says
 * "fetch failed" — which tells the shop nothing about whose fault it was.
 *
 * Callers see none of this. `payment.service.js` gets a payload or a
 * typed error exactly as it did when this was a single bare fetch.
 */
const call = async (path, { method = "GET", body, headers } = {}) => {
  assertConfigured();

  const isProbe = enterBreaker({ path, method });

  const deadline = Date.now() + CALL_BUDGET_MS;

  try {
    for (let attempt = 0; ; attempt += 1) {
      const result = await attemptOnce(path, {
        method,
        body,
        headers,
        timeoutMs: Math.min(GATEWAY_TIMEOUT_MS, deadline - Date.now()),
      });

      if (result.ok) {
        recordAlive();

        return result.payload;
      }

      const backoff = RETRY_BACKOFF_MS[attempt];

      const willRetry =
        backoff !== undefined &&
        isRetryable(result.kind, method) &&
        deadline - Date.now() - backoff >= MIN_ATTEMPT_MS;

      logFailure(result, { path, method, attempt: attempt + 1, willRetry });

      if (!willRetry) {
        if (saysGatewayIsUnwell(result.kind)) {
          recordUnwell({ wasProbe: isProbe, path, method });
        } else {
          recordAlive();
        }

        throw result.error;
      }

      await sleep(backoff + Math.random() * RETRY_JITTER_MS);
    }
  } finally {
    if (isProbe) probing = false;
  }
};

export const RazorpayGateway = {
  /** Whether a payment sheet can be opened at all. */
  isEnabled: () => env.razorpay.enabled,

  /** The public key the browser needs to open the checkout sheet. */
  publicKeyId: () => env.razorpay.keyId,

  /**
   * Opens a Razorpay order for one of ours.
   *
   * `receipt` is our order number, which is what makes a Razorpay
   * dashboard row traceable back to a row here without a lookup. It is
   * capped at forty characters by Razorpay, so it is truncated rather
   * than allowed to fail the call — an order number is well inside that
   * and the truncation should never fire.
   *
   * `notes` are free-form and come back on every webhook about this
   * order. Our own order id goes in there so that a delivery can be
   * matched even in the case where the payments row was somehow not
   * written.
   *
   * `idempotencyKey` identifies one logical attempt, so that the same
   * attempt arriving twice cannot become two orders. It is a backstop
   * and not the mechanism: duplicate suppression here is
   * PaymentRepository.withSessionLock, which is ours and is certain.
   * This covers only what a lock on our side cannot see — a POST whose
   * answer was lost in transit and which something re-sent.
   *
   * The POST retry restriction in `isRetryable` deliberately stays in
   * place even with the key attached. Razorpay documents idempotency
   * keys for some endpoints and not clearly for this one, and "Razorpay
   * probably collapses the repeat" is not a strong enough footing on
   * which to start re-POSTing orders after a timeout. The header costs
   * nothing and helps if it is honoured; the restriction is what
   * guarantees no duplicate if it is not.
   *
   * @param {object} input
   * @param {number} input.amount       in rupees
   * @param {string} input.receipt      the shop's order number
   * @param {Record<string,string>} [input.notes]
   * @param {string} [input.idempotencyKey]
   */
  async createOrder({ amount, currency, receipt, notes = {}, idempotencyKey }) {
    const payload = await call("/orders", {
      method: "POST",
      headers: idempotencyKey
        ? { "X-Razorpay-Idempotency-Key": idempotencyKey }
        : undefined,
      body: {
        amount: toMinorUnits(amount),
        currency,
        receipt: String(receipt).slice(0, MAX_RECEIPT_LENGTH),
        notes,
        // The money is taken in one step rather than authorised now and
        // captured later. A boutique that ships in ten days has no use
        // for a two-phase capture, and an authorisation left uncaptured
        // expires — silently, into a shopper who believes they have paid.
        payment_capture: 1,
      },
    });

    if (!payload?.id) {
      throw ApiError.badGateway(
        "The payment provider returned an unusable response.",
        "PAYMENT_GATEWAY_MALFORMED",
      );
    }

    return payload;
  },

  /**
   * One payment, by the provider's id.
   *
   * Used to confirm what the browser claimed. The signature already
   * proves the message came from Razorpay, but it says nothing about
   * *amount* — so the service reads the real figure back from here
   * before marking an order paid. See payment.service.js.
   *
   * This is the call the retry policy above exists for. It runs after
   * the shopper's money has already moved, so a failure here shows a
   * paid shopper a verification error — and before the retries, one
   * dropped packet was enough to produce that.
   */
  async fetchPayment(paymentId) {
    return call(`/payments/${encodeURIComponent(paymentId)}`);
  },
};
