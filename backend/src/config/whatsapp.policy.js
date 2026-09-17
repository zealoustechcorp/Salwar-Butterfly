// src/config/whatsapp.policy.js
//
// What gets said, to whom, and in which words.
//
// The order.policy.js of the notification feature. Everything that
// decides the *content* of a WhatsApp message lives here as frozen data:
// which events exist, which audience hears about each one, the approved
// template each pairing maps to, and the ordered list of parameters that
// template expects. Nothing in this file talks to Meta and nothing here
// touches the database.
//
// Data rather than a switch statement, for the reason order.policy.js
// gives about statuses: a message the shop sends is a thing somebody
// will want to change the wording of, and the change should be one entry
// in one map rather than a hunt through a service.
//
// ── The part that will bite you ──────────────────────────────
//
// A WhatsApp template is approved by Meta with a fixed number of {{n}}
// placeholders, and sending it with a different number of parameters is
// rejected at the gateway with error 132000. That failure is invisible
// until a real order tries to send, which is the worst possible moment
// to discover it.
//
// So every entry here declares `paramCount` next to its `params`
// builder, and tests/whatsapp.policy.test.js asserts the two agree for
// every template. `paramCount` is not used at runtime — it exists so a
// mismatch fails at `npm test` instead of in production.

import { createHmac } from "node:crypto";

import { ORDER_STATUS } from "./order.policy.js";

// Imported rather than written again. A constant-time comparison is the
// kind of thing that must exist once in a codebase: a second copy is a
// second chance to get it subtly wrong, and this one is already covered
// by the reasoning in payment.policy.js about why `===` will not do on a
// public webhook endpoint.
import { safeCompare } from "./payment.policy.js";

// ============================================================
// EVENTS
// ============================================================

/**
 * What happened to the parcel, in this feature's own vocabulary.
 *
 * Deliberately not the same strings as ORDER_STATUS. A status is a
 * state an order is *in*; an event is a thing that *happened*, and the
 * two drift: `confirmed` is a status, but the thing worth announcing is
 * that the order was paid for. Keeping separate words means a future
 * status that nobody is told about — or an event with no status behind
 * it, like a refund — does not force a change to the other vocabulary.
 *
 * These strings are duplicated as a CHECK constraint in migration 023.
 * That duplication is deliberate and is covered by a test.
 */
export const NOTIFY_EVENT = Object.freeze({
  ORDER_PAID: "order_paid",
  ORDER_PACKED: "order_packed",
  ORDER_SHIPPED: "order_shipped",
  ORDER_DELIVERED: "order_delivered",
  ORDER_CANCELLED: "order_cancelled",
});

export const NOTIFY_EVENTS = Object.freeze(Object.values(NOTIFY_EVENT));

/**
 * Who is being written to.
 *
 * The shop and the shopper get different messages about the same event,
 * and often only one of them gets a message at all, so the audience is
 * part of the key rather than a flag on the template.
 */
export const NOTIFY_AUDIENCE = Object.freeze({
  ADMIN: "admin",
  CUSTOMER: "customer",
});

export const NOTIFY_AUDIENCES = Object.freeze(Object.values(NOTIFY_AUDIENCE));

/**
 * The one place the two vocabularies meet.
 *
 * `pending_payment` is absent on purpose and its absence is the rule
 * that keeps unpaid orders quiet: an order that has been placed but not
 * paid for may never be paid for, and announcing it trains the shop to
 * ignore the alert that matters. 008 already draws this line by keeping
 * `status` and `payment_status` apart; this follows it.
 */
export const EVENT_FOR_STATUS = Object.freeze({
  [ORDER_STATUS.CONFIRMED]: NOTIFY_EVENT.ORDER_PAID,
  [ORDER_STATUS.PACKED]: NOTIFY_EVENT.ORDER_PACKED,
  [ORDER_STATUS.SHIPPED]: NOTIFY_EVENT.ORDER_SHIPPED,
  [ORDER_STATUS.DELIVERED]: NOTIFY_EVENT.ORDER_DELIVERED,
  [ORDER_STATUS.CANCELLED]: NOTIFY_EVENT.ORDER_CANCELLED,
});

/** null where a status is not announced at all. */
export const eventForStatus = (status) => EVENT_FOR_STATUS[status] ?? null;

// ============================================================
// DELIVERY STATE
// ============================================================

/**
 * Where a message is in its life. Mirrors the CHECK constraint on
 * whatsapp_messages.status.
 *
 * SKIPPED is the one worth explaining: it is not a failure. It is "this
 * was never going to be sent, and here is why" — the shopper did not
 * opt in, the number cannot be routed, WhatsApp is not configured on
 * this deployment. Recorded rather than dropped, because "we never told
 * her" is a question the shop will eventually ask and silence is not an
 * answer to it.
 */
export const MESSAGE_STATUS = Object.freeze({
  PENDING: "pending",
  SENDING: "sending",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  SKIPPED: "skipped",
});

export const MESSAGE_STATUSES = Object.freeze(Object.values(MESSAGE_STATUS));

/**
 * Our own reasons, recorded in the same column that holds Meta's numeric
 * codes. Prefixed with nothing and spelled in words so the two can never
 * be confused for one another at a glance.
 */
export const SKIP_REASON = Object.freeze({
  NO_OPT_IN: "NO_OPT_IN",
  UNUSABLE_PHONE: "UNUSABLE_PHONE",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  NO_RECIPIENTS: "NO_RECIPIENTS",
});

/**
 * Which states a delivery receipt may advance a row into, from where.
 *
 * Meta's receipts are not ordered: a `delivered` can arrive after the
 * `read` that logically follows it, and applying it would walk the row
 * backwards. The guarded UPDATE names the states it may move from, and
 * this is that list.
 */
export const RECEIPT_TRANSITIONS = Object.freeze({
  [MESSAGE_STATUS.DELIVERED]: Object.freeze([MESSAGE_STATUS.SENT]),
  [MESSAGE_STATUS.READ]: Object.freeze([MESSAGE_STATUS.SENT, MESSAGE_STATUS.DELIVERED]),
  [MESSAGE_STATUS.FAILED]: Object.freeze([
    MESSAGE_STATUS.PENDING,
    MESSAGE_STATUS.SENDING,
    MESSAGE_STATUS.SENT,
  ]),
});

// ============================================================
// INBOUND RECEIPTS
// ============================================================
//
// The other direction. Everything above this line decides what leaves;
// this decides how to read what Meta sends back.
//
// Meta POSTs a receipt every time one of our messages reaches a handset,
// is opened, or is given up on. Without them every row in the outbox
// stops at `sent`, which means "Meta accepted it" and not "she got it" —
// and the difference between those two is the entire question the shop
// asks when a customer says nobody told them.
//
// Nothing here talks to Meta or to the database: these are pure
// functions over the bytes that arrived, which is what makes the whole
// path testable without a webhook, a tunnel or a phone.

/**
 * The field on the subscription. Meta sends `statuses` and inbound
 * `messages` under this one name, and every other field on a WhatsApp
 * Business Account — template approvals, quality ratings, the phone
 * number's own state — arrives as a different one and is ignored.
 */
export const RECEIPT_FIELD = "messages";

/**
 * Meta's word for where a message got to → ours.
 *
 * `sent` is deliberately null. Meta emits it the instant it accepts the
 * message, which is a fact we already recorded ourselves from the POST's
 * own response, and applying it would be a write that changes nothing.
 *
 * Anything not in this map is something Meta added after this was
 * written. Ignored rather than guessed at.
 */
export const RECEIPT_STATUS_FOR_META = Object.freeze({
  sent: null,
  delivered: MESSAGE_STATUS.DELIVERED,
  read: MESSAGE_STATUS.READ,
  failed: MESSAGE_STATUS.FAILED,
});

/** null where a receipt should not move the row at all. */
export const receiptStatusFor = (metaStatus) =>
  RECEIPT_STATUS_FOR_META[String(metaStatus ?? "").toLowerCase()] ?? null;

/**
 * The signature on an inbound delivery.
 *
 * HMAC-SHA256 of the raw request body, keyed with the **app secret** —
 * not the access token, though both are secrets on the same Meta app and
 * confusing them produces a webhook that rejects every genuine delivery.
 *
 * Meta sends it as `X-Hub-Signature-256: sha256=<hex>`, and the prefix is
 * part of the header value rather than decoration, so it is produced here
 * and compared whole.
 *
 * Over the raw bytes, for the same reason the Razorpay webhook is: a
 * re-serialised body reorders keys and digests differently.
 */
export const expectedReceiptSignature = ({ rawBody, appSecret }) =>
  `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

/**
 * Whether a delivery really came from Meta.
 *
 * Constant-time, because this endpoint is public and unauthenticated and
 * an attacker may call it as often as they like.
 */
export const receiptSignatureMatches = ({ rawBody, appSecret, signature }) =>
  safeCompare(expectedReceiptSignature({ rawBody, appSecret }), String(signature ?? ""));

/**
 * Whether the verify token Meta echoes during the handshake is ours.
 *
 * The same constant-time comparison, for a much weaker credential: this
 * string proves nothing after the handshake and is not a secret in any
 * meaningful sense. It is compared this way because there is no reason to
 * compare it any other way.
 */
export const verifyTokenMatches = (candidate, expected) =>
  Boolean(expected) && safeCompare(String(expected), String(candidate ?? ""));

/**
 * Meta's timestamps are unix seconds, as a string.
 *
 * Returned as an ISO instant for Postgres, and null for anything
 * unparseable — a receipt with a broken timestamp is still a receipt, and
 * `applyReceipt` falls back to NOW() rather than refusing it.
 */
const receiptTimestamp = (value) => {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return new Date(seconds * 1000).toISOString();
};

/**
 * Pull the delivery receipts out of one webhook body.
 *
 * Meta's envelope is four levels deep and every level is an array:
 *
 *   { object, entry: [ { changes: [ { field, value: { statuses: [...] } } ] } ] }
 *
 * One POST can carry receipts for several messages, for several numbers,
 * about several different things — so this walks the whole shape rather
 * than reading entry[0].changes[0] and quietly losing the rest under
 * load, which is exactly when a batch stops being one receipt.
 *
 * A failed receipt carries Meta's own error, and it is worth keeping: it
 * is the difference between "not delivered" and "not a WhatsApp user".
 *
 * @returns {Array<{providerMessageId: string, status: string, at: string|null,
 *                  errorCode: string|null, errorDetail: string|null}>}
 */
export const readReceipts = (body) => {
  const receipts = [];

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== RECEIPT_FIELD) continue;

      for (const status of change?.value?.statuses ?? []) {
        const providerMessageId = status?.id;
        const mapped = receiptStatusFor(status?.status);

        // No wamid is nothing we could match a row by; an unmapped status
        // is a receipt that should not move the row. Both are ordinary.
        if (!providerMessageId || !mapped) continue;

        const error = status?.errors?.[0] ?? null;

        receipts.push({
          providerMessageId: String(providerMessageId),
          status: mapped,
          at: receiptTimestamp(status?.timestamp),
          errorCode: error?.code != null ? String(error.code) : null,
          errorDetail:
            error?.error_data?.details ?? error?.message ?? error?.title ?? null,
        });
      }
    }
  }

  return receipts;
};

// ============================================================
// PARAMETER SANITISING
// ============================================================

/**
 * The longest a single body parameter may be.
 *
 * Meta's own limit is 1024 characters for a body parameter. A
 * cancellation reason typed by an admin has no length limit in the
 * database (`cancellation_reason TEXT`), so this is reachable.
 */
const MAX_PARAM_LENGTH = 1024;

/**
 * Make one value safe to put in a template parameter.
 *
 * Meta rejects the whole message — 132007, or 132012 — if any body
 * parameter contains a newline, a tab, or four or more consecutive
 * spaces. Two of the values these templates carry are free text typed by
 * a human (`contact_name`, `cancellation_reason`), so this is not a
 * theoretical concern: one shopper pasting their address into the name
 * field is enough to stop every message about that order.
 *
 * An empty parameter is also rejected, hence the em dash fallback: a
 * template with a blank slot is better sent with a placeholder than not
 * sent at all.
 */
export const sanitizeParam = (value) => {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim()
    .slice(0, MAX_PARAM_LENGTH)
    .trim();

  return text || "—";
};

/**
 * Money as a person reads it, not as DECIMAL(10,2) prints it.
 *
 * `1234.5` off the driver becomes "₹1,234.50". Indian digit grouping
 * (1,23,456) via en-IN, because the shop and its customers are in India
 * and "₹1,23,456" is the form that looks right to them.
 */
export const formatMoney = (amount, currency = "INR") => {
  // Number(null), Number(undefined via ??), Number("") and Number("  ")
  // are all 0, not NaN — so a Number.isFinite check alone would render a
  // missing total as "₹0.00" and tell a shopper their order was free.
  // Absent and zero are different facts and must not print the same.
  if (amount === null || amount === undefined) return "—";
  if (typeof amount === "string" && amount.trim() === "") return "—";
  if (typeof amount === "boolean") return "—";

  const value = Number(amount);

  if (!Number.isFinite(value)) return "—";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unknown currency code would throw. Not worth failing a message
    // over; fall back to the number and the code beside it.
    return `${value.toFixed(2)} ${currency}`;
  }
};

/**
 * The only shape a template builder is allowed to read.
 *
 * One place knows which order columns a message may mention, so adding
 * a template cannot quietly widen that to the whole row — which is how
 * a customer ends up being sent `admin_note`.
 *
 * Takes a raw `orders` row, because the emit happens in the repository
 * with a row in hand and no mapper in scope.
 */
export const orderContext = (row, { unitCount = null } = {}) => {
  const name = String(row?.contact_name ?? "").trim();

  return Object.freeze({
    orderNumber: row?.order_number ?? "—",

    contactName: name || "—",

    // Templates address the shopper, and "Hi Meera Krishnan" reads like
    // a bank. The first word only, falling back to the whole string.
    firstName: name.split(/\s+/)[0] || "—",

    total: row?.total ?? null,
    currency: row?.currency ?? "INR",

    // Null when the caller had no items to hand. Templates that use it
    // are only emitted from paths that do.
    unitCount,

    shippingCity: row?.shipping_city ?? "—",

    cancellationReason: row?.cancellation_reason ?? null,
  });
};

// ============================================================
// THE CATALOGUE
// ============================================================

/**
 * Every message this system can send.
 *
 * Keyed audience → event. A missing entry means that audience is not
 * told about that event, and that is the whole mechanism — there is no
 * `enabled` flag, because a flag and an absence are two ways to say the
 * same thing and a codebase with both eventually says both.
 *
 * `name` and `language` must match a template approved in WhatsApp
 * Manager exactly. The language is the trap: creating a template as
 * "English (US)" gives it the code `en_US`, and sending it with `en`
 * fails with 132001 "template name does not exist in the translation".
 * Everything here is plain `en`; approve them that way.
 *
 * Admin entries exist for all five events even though only two are
 * subscribed by default. The shop manages its own subscriptions per
 * recipient in whatsapp_recipient_events, and a template that does not
 * exist cannot be offered as a toggle — the owner who wants to know
 * when the packing desk marks something shipped should be able to ask
 * for it without a deployment.
 */
export const WHATSAPP_TEMPLATES = Object.freeze({
  [NOTIFY_AUDIENCE.ADMIN]: Object.freeze({
    // {{1}} order  {{2}} amount  {{3}} pieces  {{4}} customer  {{5}} city
    [NOTIFY_EVENT.ORDER_PAID]: Object.freeze({
      name: "sb_admin_new_paid_order",
      language: "en",
      paramCount: 5,
      params: (ctx) => [
        ctx.orderNumber,
        formatMoney(ctx.total, ctx.currency),
        ctx.unitCount === null ? "—" : String(ctx.unitCount),
        ctx.contactName,
        ctx.shippingCity,
      ],
    }),

    // {{1}} order  {{2}} customer
    [NOTIFY_EVENT.ORDER_PACKED]: Object.freeze({
      name: "sb_admin_order_packed",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.orderNumber, ctx.contactName],
    }),

    // {{1}} order  {{2}} customer  {{3}} city
    [NOTIFY_EVENT.ORDER_SHIPPED]: Object.freeze({
      name: "sb_admin_order_shipped",
      language: "en",
      paramCount: 3,
      params: (ctx) => [ctx.orderNumber, ctx.contactName, ctx.shippingCity],
    }),

    // {{1}} order  {{2}} customer
    [NOTIFY_EVENT.ORDER_DELIVERED]: Object.freeze({
      name: "sb_admin_order_delivered",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.orderNumber, ctx.contactName],
    }),

    // {{1}} order  {{2}} customer  {{3}} reason
    [NOTIFY_EVENT.ORDER_CANCELLED]: Object.freeze({
      name: "sb_admin_order_cancelled",
      language: "en",
      paramCount: 3,
      params: (ctx) => [
        ctx.orderNumber,
        ctx.contactName,
        ctx.cancellationReason ?? "no reason given",
      ],
    }),
  }),

  [NOTIFY_AUDIENCE.CUSTOMER]: Object.freeze({
    // {{1}} name  {{2}} order  {{3}} amount
    [NOTIFY_EVENT.ORDER_PAID]: Object.freeze({
      name: "sb_order_confirmed",
      language: "en",
      paramCount: 3,
      params: (ctx) => [
        ctx.firstName,
        ctx.orderNumber,
        formatMoney(ctx.total, ctx.currency),
      ],
    }),

    // {{1}} name  {{2}} order
    [NOTIFY_EVENT.ORDER_PACKED]: Object.freeze({
      name: "sb_order_packed",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.firstName, ctx.orderNumber],
    }),

    [NOTIFY_EVENT.ORDER_SHIPPED]: Object.freeze({
      name: "sb_order_shipped",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.firstName, ctx.orderNumber],
    }),

    [NOTIFY_EVENT.ORDER_DELIVERED]: Object.freeze({
      name: "sb_order_delivered",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.firstName, ctx.orderNumber],
    }),

    [NOTIFY_EVENT.ORDER_CANCELLED]: Object.freeze({
      name: "sb_order_cancelled",
      language: "en",
      paramCount: 2,
      params: (ctx) => [ctx.firstName, ctx.orderNumber],
    }),
  }),
});

/**
 * The template for one audience and one event, or null where that
 * audience is not told about that event.
 *
 * Returns null rather than throwing for an unknown audience too: the
 * callers are a worker and a settings screen, and neither is improved
 * by an exception where "nothing to send" is a perfectly good answer.
 */
export const templateFor = (audience, event) =>
  WHATSAPP_TEMPLATES[audience]?.[event] ?? null;

/**
 * Which events an audience can be subscribed to — the rows the admin
 * settings screen draws, derived from the catalogue rather than listed
 * again beside it.
 */
export const eventsForAudience = (audience) =>
  NOTIFY_EVENTS.filter((event) => templateFor(audience, event) !== null);

/**
 * What a newly added recipient hears about until somebody says
 * otherwise.
 *
 * Money arriving, and an order being called off. Both are things that
 * happened *to* the shop. The packed/shipped/delivered events are
 * things the shop did itself — being messaged about your own click is
 * noise, and noise is what makes the alert that matters get ignored.
 * Available as toggles; just not on by default.
 */
export const DEFAULT_ADMIN_EVENTS = Object.freeze([
  NOTIFY_EVENT.ORDER_PAID,
  NOTIFY_EVENT.ORDER_CANCELLED,
]);

/**
 * Build the parameter list for one message, already sanitised.
 *
 * The single entry point the emit path uses, so that "run the builder,
 * then clean every value" cannot be half-done in one caller.
 *
 * @returns {string[]|null} null when this audience is not told about
 *   this event — the caller writes no row at all.
 */
export const buildParams = (audience, event, ctx) => {
  const template = templateFor(audience, event);

  if (!template) return null;

  return template.params(ctx).map(sanitizeParam);
};
