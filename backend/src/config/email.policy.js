// src/config/email.policy.js
//
// Which emails exist, who receives each one, and which order event sends
// it. The email counterpart to whatsapp.policy.js, and keyed on the same
// NOTIFY_EVENT words so the two channels cannot disagree about what
// happened to an order.

import { NOTIFY_EVENT } from "./whatsapp.policy.js";

// ============================================================
// KINDS
// ============================================================

/**
 * One value per email template. Mirrored by the CHECK constraint in
 * 024_create_email_notifications.sql — adding one means changing both.
 */
export const EMAIL_KIND = Object.freeze({
  /** To the shopper: payment received, here is what you bought. */
  ORDER_CONFIRMED: "order_confirmed",

  /** To the shopper: packed, here is the courier and tracking number. */
  ORDER_PACKED: "order_packed",

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
 * email — shipped, delivered and cancelled are WhatsApp-only for now.
 */
export const EMAILS_FOR_EVENT = Object.freeze({
  [NOTIFY_EVENT.ORDER_PAID]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_CONFIRMED, audience: EMAIL_AUDIENCE.CUSTOMER }),
    Object.freeze({ kind: EMAIL_KIND.ADMIN_NEW_ORDER, audience: EMAIL_AUDIENCE.ADMIN }),
  ]),
  [NOTIFY_EVENT.ORDER_PACKED]: Object.freeze([
    Object.freeze({ kind: EMAIL_KIND.ORDER_PACKED, audience: EMAIL_AUDIENCE.CUSTOMER }),
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
