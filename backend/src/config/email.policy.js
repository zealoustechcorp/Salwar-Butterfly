// src/config/email.policy.js
//
// Which emails exist, who receives each one, and which order event sends
// it. Email is the shop's only notification channel.

import { ORDER_STATUS } from "./order.policy.js";

// ============================================================
// EVENTS
// ============================================================

/**
 * What happened to the parcel, in the notification vocabulary.
 *
 * Deliberately not the same strings as ORDER_STATUS. A status is a
 * state an order is *in*; an event is a thing that *happened*, and the
 * two drift: `confirmed` is a status, but the thing worth announcing is
 * that the order was paid for.
 */
export const NOTIFY_EVENT = Object.freeze({
  ORDER_PAID: "order_paid",
  ORDER_PACKED: "order_packed",
  ORDER_SHIPPED: "order_shipped",
  ORDER_DELIVERED: "order_delivered",
  ORDER_CANCELLED: "order_cancelled",
});

/**
 * The one place the two vocabularies meet.
 *
 * `pending_payment` is absent on purpose and its absence is the rule
 * that keeps unpaid orders quiet: an order that has been placed but not
 * paid for may never be paid for.
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
// KINDS
// ============================================================

/**
 * One value per email template. Mirrored by the CHECK constraint on
 * email_messages.kind (024, widened in 035) — adding one means changing
 * both.
 */
export const EMAIL_KIND = Object.freeze({
  /** To the shopper: payment received, here is what you bought. */
  ORDER_CONFIRMED: "order_confirmed",

  /** To the shopper: packed, here is the courier and tracking number. */
  ORDER_PACKED: "order_packed",

  /** To the shopper: handed to the courier. */
  ORDER_SHIPPED: "order_shipped",

  /** To the shopper: delivered, and how to raise a problem. */
  ORDER_DELIVERED: "order_delivered",

  /** To the shopper: the shop cancelled a paid order. */
  ORDER_CANCELLED: "order_cancelled",

  /** To the shop: a new paid order to pack. */
  ADMIN_NEW_ORDER: "admin_new_order",
});

export const EMAIL_AUDIENCE = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin",
});

export const EMAIL_STATUS = Object.freeze({
  PENDING: "pending",
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
  /** Recorded and never sent — email is not configured, or no address. */
  SKIPPED: "skipped",
});

export const EMAIL_SKIP_REASON = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  NO_ADDRESS: "NO_ADDRESS",
});

// ============================================================
// EVENT -> EMAILS
// ============================================================

/**
 * Which emails each order event produces. An event missing here sends no
 * email.
 */
export const EMAILS_FOR_EVENT = Object.freeze({
  [NOTIFY_EVENT.ORDER_PAID]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_CONFIRMED, audience: EMAIL_AUDIENCE.CUSTOMER }),
    Object.freeze({ kind: EMAIL_KIND.ADMIN_NEW_ORDER, audience: EMAIL_AUDIENCE.ADMIN }),
  ]),
  [NOTIFY_EVENT.ORDER_PACKED]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_PACKED, audience: EMAIL_AUDIENCE.CUSTOMER }),
  ]),
  [NOTIFY_EVENT.ORDER_SHIPPED]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_SHIPPED, audience: EMAIL_AUDIENCE.CUSTOMER }),
  ]),
  [NOTIFY_EVENT.ORDER_DELIVERED]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_DELIVERED, audience: EMAIL_AUDIENCE.CUSTOMER }),
  ]),
  [NOTIFY_EVENT.ORDER_CANCELLED]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_CANCELLED, audience: EMAIL_AUDIENCE.CUSTOMER }),
  ]),
});

export const emailsForEvent = (event) => EMAILS_FOR_EVENT[event] ?? [];

// ============================================================
// THE IDEMPOTENCY KEY
// ============================================================

/**
 * Unique per order, email and recipient. Stored as the outbox row's
 * dedupe_key and sent to Resend as its Idempotency-Key, so neither a
 * repeated emit nor a retried send can produce a second email.
 */
export const emailDedupeKey = ({ orderId, kind, toEmail }) =>
  `${orderId}.${kind}.${String(toEmail).toLowerCase()}`;

// ============================================================
// PASSWORD RESET
// ============================================================

/** How long a reset link works for. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/**
 * The shortest gap between two reset emails to one account. A second
 * click inside it is answered exactly like the first but sends nothing,
 * so the form cannot be used to flood somebody's inbox.
 */
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

/**
 * How long an admin reset link works for. Half the shopper's: an admin
 * account reaches every order, refund and customer, so a link sitting in
 * a mailbox is worth more to whoever opens it.
 */
export const ADMIN_PASSWORD_RESET_TTL_MINUTES = 15;
