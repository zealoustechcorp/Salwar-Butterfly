// src/config/whatsapp.gateway.js
//
// The Meta WhatsApp Cloud API client.
//
// Sits beside razorpay.gateway.js and r2.storage.js and does the
// same job: it is the only file in the project that knows a third
// party's wire format, so the service above it talks in template names
// and phone numbers and never in Graph API versions, `messaging_product`
// or `wamid.` prefixes.
//
// Written against `fetch` rather than a WhatsApp SDK, for the reason
// razorpay.gateway.js gives: exactly one endpoint is used, it is a POST
// with a bearer token, and a package would add a dependency, its own
// timeout behaviour and a second place for the access token to live in
// exchange for saving forty lines.
//
// ── What makes this different from the Razorpay client ──────
//
// One thing, and everything here follows from it: **Meta's /messages
// endpoint has no idempotency key.** Razorpay at least accepts
// X-Razorpay-Idempotency-Key, and that file *still* refuses to retry a
// POST that timed out. The same rule binds harder here. Re-sending a
// request whose outcome we do not know delivers a second identical "your
// order has shipped" to a real person, and there is nothing on Meta's
// side that would collapse the two.
//
// So every failure this file raises answers two questions, not one:
//
//   retryable  may this be attempted again at all?
//   ambiguous  might the first attempt already have reached the handset?
//
// A retry is only safe when the answer to the second is no. `unsent` is
// the only failure this file retries in process; everything else is
// handed up with its classification and the worker decides.
//
// Nothing here decides anything about an order. It makes a call, checks
// the shape of what came back, and raises a typed error.

import { env } from "./env.js";
import { logger } from "../utils/logger.js";
import { maskPhone, toE164 } from "../utils/phone.js";

const GRAPH_BASE = "https://graph.facebook.com";

// ============================================================
// TIMEOUTS AND RETRY POLICY
// ============================================================

/**
 * The ceiling on one attempt.
 *
 * Longer than the Razorpay client's per-attempt budget would suggest,
 * because nobody is watching a spinner on the other end of this — the
 * caller is a background worker. Ten seconds is far longer than Meta
 * takes and short enough that a wedged socket does not hold a worker
 * slot for a minute.
 */
const SEND_TIMEOUT_MS = 10_000;

/** Every attempt and every pause between them. */
const CALL_BUDGET_MS = 15_000;

/**
 * One entry means two attempts at most, and it applies to `unsent`
 * alone — see the note at the top of this file about the missing
 * idempotency key.
 *
 * The jitter is for the same reason as the one in db.js: without it,
 * everything that failed during the same blip comes back at the same
 * millisecond and blips it again.
 */
const RETRY_BACKOFF_MS = [400];
const RETRY_JITTER_MS = 200;

/** Consecutive unwell calls before the breaker opens. */
const BREAKER_THRESHOLD = 5;

/**
 * How long it stays open before one probe is let through.
 *
 * Longer than Razorpay's thirty seconds, deliberately. That breaker
 * guards a path with a shopper waiting on it, so it reopens eagerly.
 * This one guards messages that are already durably recorded in the
 * outbox and lose nothing by arriving a minute later.
 */
const BREAKER_COOLDOWN_MS = 60_000;

// ============================================================
// FAILURE TAXONOMY
// ============================================================

/**
 * Why a send failed.
 *
 *   UNSENT        provably never left this process — DNS did not
 *                 resolve, the connection was refused. Safe to repeat.
 *   TIMEOUT       no answer inside the deadline. It may well have been
 *                 delivered; we do not know.
 *   NETWORK       the connection broke mid-flight. Same unknown.
 *   UNREADABLE    a 2xx whose body could not be parsed. Meta accepted
 *                 something; re-sending would duplicate it.
 *   THROTTLED     Meta explicitly said "too fast". Nothing was sent, so
 *                 this is safe to repeat once the queue has waited.
 *   UNHEALTHY     5xx. Meta is up and unwell. Nothing was sent.
 *   MISCONFIGURED an expired token, an unregistered number, a locked
 *                 account. A human has to act; retrying cannot help.
 *   REJECTED      Meta considered it and said no — not a WhatsApp user,
 *                 a template that does not exist, a bad parameter. A
 *                 decision, not a failure.
 */
export const WHATSAPP_FAILURE = Object.freeze({
  UNSENT: "unsent",
  TIMEOUT: "timeout",
  NETWORK: "network",
  UNREADABLE: "unreadable",
  THROTTLED: "throttled",
  UNHEALTHY: "unhealthy",
  MISCONFIGURED: "misconfigured",
  REJECTED: "rejected",
});

/**
 * What every failure in this file becomes.
 *
 * Deliberately not an ApiError, unlike razorpay.gateway.js. That file's
 * caller is an HTTP handler with a shopper on the other end, so shaping
 * failures as 502 and 504 is the useful thing to do. This file's caller
 * is a background worker, and the only questions a worker has are the
 * two this carries.
 */
export class WhatsAppSendError extends Error {
  constructor(message, { kind, retryable, ambiguous, code = null, subcode = null, detail = null, httpStatus = null } = {}) {
    super(message);

    this.name = "WhatsAppSendError";
    this.kind = kind;
    this.retryable = Boolean(retryable);

    // Whether the message may already have arrived. A retry of an
    // ambiguous failure risks a duplicate on somebody's phone.
    this.ambiguous = Boolean(ambiguous);

    // Meta's numeric code, recorded on the outbox row so a human can
    // look it up. Never branched on outside this file.
    this.code = code;
    this.subcode = subcode;
    this.detail = detail;
    this.httpStatus = httpStatus;
  }
}

/**
 * `fetch` reports every transport failure as the same bare TypeError;
 * the real socket error hides in `cause`. These are the codes that mean
 * the request had not gone out when it died.
 */
const UNSENT_ERROR_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);

/**
 * Meta codes that mean "slow down". Nothing was sent, so repeating is
 * safe once something has waited.
 */
const THROTTLE_CODES = new Set([130429, 131048, 131056, 80007, 4]);

/**
 * Meta codes that mean somebody has to go and fix the setup. Retrying
 * one of these forever is how a queue turns an expired token into a
 * hundred thousand log lines.
 *
 * 190 is the one to watch: it is what an expired access token looks
 * like, and since the token the Graph API explorer hands out lasts 24
 * hours, it is the single most likely thing to take this feature down
 * after a successful first day.
 */
const MISCONFIGURED_CODES = new Set([
  190, // access token expired, revoked, or invalid
  102, // session/auth problem
  200, // permission missing on the token
  131042, // business eligibility — usually an unpaid account
  131031, // the account has been locked
  133010, // the phone number is not registered
  133016, // the number is in a bad registration state
  368, // temporarily blocked for policy violations
]);

/**
 * Meta codes that are a considered refusal of this specific message.
 *
 * The 132xxx family is worth calling out: those are template problems —
 * wrong parameter count, a name that does not exist in that language, a
 * paused or disabled template. Every one of them is a bug in
 * whatsapp.policy.js rather than anything about the recipient, and
 * retrying cannot fix a bug. tests/whatsapp.policy.test.js exists to
 * catch them before they are ever sent.
 */
const REJECTED_CODES = new Set([
  131026, // undeliverable — most often "not a WhatsApp user"
  131047, // re-engagement required (see the note in classify())
  131049, // Meta chose not to deliver, to protect user experience
  131051, // unsupported message type
  470, // the 24-hour window closed on a free-form message
  100, // an invalid parameter somewhere in the payload
  132000, // parameter count does not match the approved template
  132001, // template name/language pair does not exist
  132005, // a parameter is longer than the template allows
  132007, // a parameter has disallowed formatting
  132012, // a parameter's format is invalid
  132015, // the template is paused
  132016, // the template is disabled
  132068, // the flow attached to the template is blocked
]);

/**
 * Whether a finished attempt is evidence that Meta itself is in
 * trouble, as opposed to evidence that it is alive and disagreeing with
 * us.
 *
 * Only the former feeds the breaker. A shop with a mistyped template
 * name would otherwise trip it on the fifth rejected message and stop
 * sending everything else — which is the exact opposite of what a
 * breaker is for.
 */
const saysMetaIsUnwell = (kind) =>
  kind !== WHATSAPP_FAILURE.REJECTED && kind !== WHATSAPP_FAILURE.MISCONFIGURED;

// ============================================================
// CIRCUIT BREAKER STATE
// ============================================================
//
// Module-level, so per process, for the reason razorpay.gateway.js
// gives: a shared count would need a round trip to somewhere to make a
// decision whose entire purpose is to avoid round trips.

let consecutiveFailures = 0;
let openedAt = null;
let probing = false;

const breakerIsOpen = () => openedAt !== null;

/**
 * Puts the breaker back to cold. For tests only.
 *
 * The state above is per process and deliberately so, which leaves a
 * test suite no way to start a case from a known position — and a
 * breaker tripped by the previous test is exactly the sort of shared
 * state that makes a suite pass in one order and fail in another.
 */
export const resetWhatsAppBreaker = () => {
  consecutiveFailures = 0;
  openedAt = null;
  probing = false;
};

/**
 * The gate every send passes through before it is allowed to dial out.
 *
 * @returns {boolean} true when this call is the half-open probe
 * @throws {WhatsAppSendError} when the breaker is open
 */
const enterBreaker = () => {
  if (!breakerIsOpen()) return false;

  const cooled = Date.now() - openedAt >= BREAKER_COOLDOWN_MS;

  // One probe at a time: the point of a cooldown is not to hand a
  // struggling gateway the whole backlog the moment it expires.
  if (!cooled || probing) {
    throw new WhatsAppSendError("WhatsApp calls are paused by the circuit breaker", {
      kind: WHATSAPP_FAILURE.UNHEALTHY,
      // Retryable and not ambiguous: nothing was sent, by construction.
      // The job goes back on the queue and costs one Redis round trip
      // rather than a ten-second timeout.
      retryable: true,
      ambiguous: false,
      code: "BREAKER_OPEN",
    });
  }

  probing = true;

  return true;
};

/** Meta answered something — anything. Whatever it said, it is up. */
const recordAlive = () => {
  if (breakerIsOpen()) {
    logger.info("WhatsApp circuit breaker closed", { downForMs: Date.now() - openedAt });

    openedAt = null;
  }

  consecutiveFailures = 0;
};

/**
 * Logged at `error` on the transition only, never per call: an outage
 * should read as one event in the log rather than several hundred
 * identical timeouts.
 */
const recordUnwell = ({ wasProbe }) => {
  consecutiveFailures += 1;

  if (breakerIsOpen()) {
    if (wasProbe) {
      openedAt = Date.now();

      logger.error("WhatsApp circuit breaker probe failed; staying open", {
        cooldownMs: BREAKER_COOLDOWN_MS,
      });
    }

    return;
  }

  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    openedAt = Date.now();

    logger.error("WhatsApp circuit breaker opened", {
      consecutiveFailures,
      cooldownMs: BREAKER_COOLDOWN_MS,
    });
  }
};

// ============================================================
// CLASSIFICATION
// ============================================================

/**
 * Turn Meta's answer into one of WHATSAPP_FAILURE.
 *
 * Meta's error envelope is
 *   { error: { message, type, code, error_subcode, error_data: { details } } }
 * and `error_data.details` is usually the only part worth reading — the
 * top-level `message` is often just "Unsupported post request".
 */
const classify = (httpStatus, payload) => {
  const error = payload?.error ?? {};
  const code = Number(error.code);
  const subcode = error.error_subcode ?? null;

  const detail =
    error.error_data?.details ?? error.message ?? `HTTP ${httpStatus}`;

  const base = { code: Number.isFinite(code) ? String(code) : null, subcode, detail, httpStatus };

  // Authentication and authorization, whatever code rides along with
  // them. Checked before the code tables because a 401 is unambiguous
  // and a missing code should not fall through to "rejected".
  if (httpStatus === 401 || httpStatus === 403) {
    return { kind: WHATSAPP_FAILURE.MISCONFIGURED, retryable: false, ambiguous: false, ...base };
  }

  if (MISCONFIGURED_CODES.has(code)) {
    return { kind: WHATSAPP_FAILURE.MISCONFIGURED, retryable: false, ambiguous: false, ...base };
  }

  if (httpStatus === 429 || THROTTLE_CODES.has(code)) {
    // Nothing was sent — Meta refused before doing anything — so a
    // repeat is safe. Not retried here, though: a throttle wants the
    // queue's backoff measured in seconds, not an in-process pause.
    return { kind: WHATSAPP_FAILURE.THROTTLED, retryable: true, ambiguous: false, ...base };
  }

  if (httpStatus >= 500) {
    return { kind: WHATSAPP_FAILURE.UNHEALTHY, retryable: true, ambiguous: false, ...base };
  }

  if (REJECTED_CODES.has(code)) {
    return { kind: WHATSAPP_FAILURE.REJECTED, retryable: false, ambiguous: false, ...base };
  }

  // Default deny, the same rule razorpay.gateway.js's isRetryable
  // applies: an unrecognised 4xx is a decision we do not understand, and
  // repeating it will not make it understood.
  return { kind: WHATSAPP_FAILURE.REJECTED, retryable: false, ambiguous: false, ...base };
};

// ============================================================
// REQUEST
// ============================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Where this message is actually going.
 *
 * Normally the number it was addressed to. With WHATSAPP_TEST_RECIPIENT
 * set it is that number instead, whoever the message was for — see the
 * TEST MODE note in env.js.
 *
 * Here, in buildPayload's caller, and nowhere else: this is the last
 * line before the number becomes an HTTP body, so there is no code path
 * that reaches Meta without passing through it. Doing it further up —
 * in the planner, or in the service — would leave the gateway itself,
 * the sweeper and any future caller able to address a real handset.
 *
 * Logged at `warn` on every single send, deliberately. This is the one
 * piece of configuration in the project that makes the system lie about
 * what it did: the outbox will say the shopper was messaged and the
 * message went somewhere else. That belongs in the log every time, not
 * once at boot.
 */
const destinationFor = (to) => {
  const override = env.whatsapp.testRecipient;

  if (!override) return to;

  if (toE164(to) !== override) {
    logger.warn("WhatsApp TEST MODE — message redirected", {
      addressedTo: maskPhone(to),
      sentTo: maskPhone(override),
    });
  }

  return override;
};

/**
 * The Graph API body for one template message.
 *
 * Two details worth stating, because both are silent when wrong:
 *
 *   `to` carries no leading '+'. The Cloud API tolerates one, but bare
 *   digits are the documented form, and the outbox stores '+' because
 *   that is what a human reads. Stripping it is this file's job.
 *
 *   An empty `components` array is omitted entirely rather than sent
 *   empty — a template with no placeholders is rejected with 132000 if
 *   it is handed an empty body component.
 */
const buildPayload = ({ to, name, language, params }) => {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(destinationFor(to)).replace(/^\+/, ""),
    type: "template",
    template: {
      name,
      language: { code: language },
    },
  };

  if (Array.isArray(params) && params.length > 0) {
    payload.template.components = [
      {
        type: "body",
        parameters: params.map((text) => ({ type: "text", text: String(text) })),
      },
    ];
  }

  return payload;
};

/**
 * One HTTP exchange with Meta.
 *
 * Returns rather than throws, because the caller has to look at *why*
 * this failed before deciding whether to try again.
 *
 * @returns {{ok: true, messageId: string, waId: string|null}
 *          |{ok: false, kind: string, retryable: boolean, ambiguous: boolean, ...}}
 */
const attemptOnce = async (payload, timeoutMs) => {
  const { apiVersion, phoneNumberId, accessToken } = env.whatsapp;

  let response;

  try {
    response = await fetch(`${GRAPH_BASE}/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";

    if (timedOut) {
      return {
        ok: false,
        kind: WHATSAPP_FAILURE.TIMEOUT,
        retryable: false,
        // The request may have arrived and been acted on. This is the
        // flag that stops a duplicate landing on somebody's phone.
        ambiguous: true,
        code: "TIMEOUT",
        detail: `No answer from Meta within ${timeoutMs}ms`,
        httpStatus: null,
      };
    }

    const code = error?.cause?.code ?? error?.code;
    const unsent = UNSENT_ERROR_CODES.has(code);

    return {
      ok: false,
      kind: unsent ? WHATSAPP_FAILURE.UNSENT : WHATSAPP_FAILURE.NETWORK,
      retryable: unsent,
      ambiguous: !unsent,
      code: code ?? "NETWORK",
      detail: error?.message ?? "Transport failure",
      httpStatus: null,
    };
  }

  let payloadBack = null;
  let unreadable = false;

  try {
    payloadBack = await response.json();
  } catch {
    unreadable = true;
  }

  if (response.ok) {
    const messageId = payloadBack?.messages?.[0]?.id ?? null;

    // A 2xx we cannot read is not a success. Meta has accepted the
    // message and is going to deliver it; we simply did not catch the
    // handle. Re-POSTing would send it twice, so this is recorded as
    // ambiguous and never retried — the same reasoning razorpay's
    // UNREADABLE branch applies to a payment.
    //
    // Reachable exactly when it hurts: AbortSignal.timeout covers the
    // body stream too, so a fast status line followed by a slow body
    // lands here.
    if (unreadable || !messageId) {
      return {
        ok: false,
        kind: WHATSAPP_FAILURE.UNREADABLE,
        retryable: false,
        ambiguous: true,
        code: "UNREADABLE",
        detail: unreadable
          ? "Meta returned 2xx with an unreadable body"
          : "Meta returned 2xx with no message id",
        httpStatus: response.status,
      };
    }

    return {
      ok: true,
      messageId,
      waId: payloadBack?.contacts?.[0]?.wa_id ?? null,
    };
  }

  return { ok: false, ...classify(response.status, payloadBack) };
};

// ============================================================
// THE GATEWAY
// ============================================================

export const WhatsAppGateway = {
  isEnabled: () => env.whatsapp.enabled,

  /**
   * Send one approved template to one number.
   *
   * @param {object}   args
   * @param {string}   args.to        E.164, with or without the '+'
   * @param {string}   args.name      the approved template name
   * @param {string}   args.language  its language code, e.g. 'en'
   * @param {string[]} args.params    ordered body parameters
   *
   * @returns {Promise<{messageId: string, waId: string|null}>}
   * @throws  {WhatsAppSendError}
   */
  async sendTemplate({ to, name, language, params = [] }) {
    if (!env.whatsapp.enabled) {
      throw new WhatsAppSendError("WhatsApp is not configured on this deployment", {
        kind: WHATSAPP_FAILURE.MISCONFIGURED,
        retryable: false,
        ambiguous: false,
        code: "NOT_CONFIGURED",
        detail: "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are not set",
      });
    }

    const wasProbe = enterBreaker();
    const payload = buildPayload({ to, name, language, params });
    const startedAt = Date.now();

    let attempt = 0;
    let last = null;

    try {
      // The loop runs at most RETRY_BACKOFF_MS.length + 1 times, and
      // only ever goes round for an `unsent` failure.
      for (;;) {
        const spent = Date.now() - startedAt;
        const remaining = CALL_BUDGET_MS - spent;

        if (remaining <= 0) break;

        const result = await attemptOnce(payload, Math.min(SEND_TIMEOUT_MS, remaining));

        if (result.ok) {
          recordAlive();

          // `debug`, not `info`: one line per message is the loudest
          // thing this feature could do, and it says nothing the outbox
          // row does not already record — that row holds the same
          // message id against a `sent` status. Turn it on with
          // LOG_LEVEL=debug when a specific send needs following.
          logger.debug("WhatsApp message sent", {
            template: name,
            to: maskPhone(to),
            messageId: result.messageId,
            attempts: attempt + 1,
          });

          return { messageId: result.messageId, waId: result.waId };
        }

        last = result;

        // The classification already answers "is Meta unwell, or is it
        // alive and disagreeing with us" — and it is the only thing that
        // may answer it. Consulting the HTTP status here instead would
        // treat a 500 as a sign of life, which is precisely backwards:
        // an outage is the one case the breaker exists for, and it
        // arrives as a status code.
        if (saysMetaIsUnwell(result.kind)) recordUnwell({ wasProbe });
        else recordAlive();

        // The only failure repeated in process. Everything else either
        // cannot be helped by a retry, or might already have been
        // delivered — see the note at the top of this file.
        const pause = RETRY_BACKOFF_MS[attempt];

        if (result.kind !== WHATSAPP_FAILURE.UNSENT || pause === undefined) break;

        attempt += 1;

        await sleep(pause + Math.floor(Math.random() * RETRY_JITTER_MS));
      }
    } finally {
      if (wasProbe) probing = false;
    }

    // Only reachable with a failure in hand: the success path returns
    // from inside the loop.
    const failure = last ?? {
      kind: WHATSAPP_FAILURE.TIMEOUT,
      retryable: false,
      ambiguous: true,
      code: "BUDGET_EXHAUSTED",
      detail: `No attempt completed within ${CALL_BUDGET_MS}ms`,
      httpStatus: null,
    };

    // The budget-exhausted case never went through the loop body, so it
    // was never counted. Everything else already has been.
    if (!last) recordUnwell({ wasProbe });

    // `debug`, not `warn`. A failure here is not yet news: most are
    // retryable, the sweeper will have another go, and the outbox row
    // carries the code and detail either way. The caller is the one that
    // knows whether this was the last attempt, and it warns then — see
    // "Notification will not be sent" in notification.service.js. An
    // outage is already an `error`, logged once on the transition by
    // recordUnwell above rather than once per call.
    logger.debug("WhatsApp send failed", {
      template: name,
      to: maskPhone(to),
      kind: failure.kind,
      code: failure.code,
      detail: failure.detail,
    });

    throw new WhatsAppSendError(failure.detail ?? "WhatsApp send failed", failure);
  },
};
