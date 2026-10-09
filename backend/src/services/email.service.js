// src/services/email.service.js
//
// Order emails, built on exactly the split notification.service.js uses
// for WhatsApp — read its header for the full reasoning:
//
//   emitTx    inside the order's transaction, behind a SAVEPOINT. Writes
//             which emails are owed and nothing else. Cannot fail the
//             order and cannot reach the network.
//   deliver   later, from the committed row. Renders the email from the
//             order as it is now, sends it through Resend, records the
//             outcome. May fail freely; the sweeper retries.
//
// Password reset is deliberately NOT in the outbox. Its email carries a
// live credential (the reset link), and an outbox row is a durable copy
// of whatever it holds. It is sent directly instead — and if that send
// fails, the shopper simply asks for another link.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { EmailGateway, EmailSendError } from "../config/email.gateway.js";
import {
  EMAIL_AUDIENCE,
  EMAIL_KIND,
  EMAIL_SKIP_REASON,
  EMAIL_STATUS,
  emailDedupeKey,
  emailsForEvent,
} from "../config/email.policy.js";
import {
  adminNewOrderEmail,
  orderConfirmedEmail,
  orderPackedEmail,
} from "../emails/templates.js";
import { EmailRepository } from "../repository/email.repository.js";
import { OrderRepository } from "../repository/order.repository.js";
import { logger } from "../utils/logger.js";

/** A minute, doubling per attempt, capped at an hour. */
const retryBackoffSeconds = (attempts) => Math.min(60 * 2 ** Math.max(attempts - 1, 0), 3_600);

/** Six attempts span about an hour with the backoff above. */
const MAX_ATTEMPTS = 6;

const RENDERERS = Object.freeze({
  [EMAIL_KIND.ORDER_CONFIRMED]: orderConfirmedEmail,
  [EMAIL_KIND.ORDER_PACKED]: orderPackedEmail,
  [EMAIL_KIND.ADMIN_NEW_ORDER]: adminNewOrderEmail,
});

/** Mask the local part for logs: dh****@gmail.com. */
export const maskEmail = (address) => {
  const [local = "", domain = ""] = String(address ?? "").split("@");
  return `${local.slice(0, 2)}****@${domain}`;
};

/** Every outbox row an order event should produce. */
function planOrderEvent(order, event) {
  const rows = [];

  const status = env.email.enabled ? EMAIL_STATUS.PENDING : EMAIL_STATUS.SKIPPED;
  const errorCode = env.email.enabled ? null : EMAIL_SKIP_REASON.NOT_CONFIGURED;

  for (const { kind, audience } of emailsForEvent(event)) {
    // The shopper: the address typed into this checkout, not the
    // account's — the same choice the WhatsApp side makes for the phone.
    const recipients =
      audience === EMAIL_AUDIENCE.CUSTOMER
        ? [String(order.contact_email ?? "").trim().toLowerCase()].filter(Boolean)
        : env.email.adminRecipients;

    for (const toEmail of recipients) {
      rows.push({
        dedupeKey: emailDedupeKey({ orderId: order.id, kind, toEmail }),
        orderId: order.id,
        kind,
        audience,
        toEmail,
        status,
        errorCode,
      });
    }
  }

  return rows;
}

export const EmailService = {
  /**
   * Record which emails are owed, inside the caller's transaction.
   *
   * Never throws — a failure leaves the order change intact and nobody
   * emailed, which is the right way round.
   *
   * @returns {Promise<string[]>} ids of rows to dispatch after the commit
   */
  async emitTx(client, order, event) {
    if (!order?.id || !event) return [];
    if (emailsForEvent(event).length === 0) return [];

    // A SAVEPOINT, not a bare try/catch: a failed INSERT would otherwise
    // poison the caller's transaction and take the order down with it.
    await client.query("SAVEPOINT email_notify");

    try {
      const rows = planOrderEvent(order, event);
      const ids = rows.length > 0 ? await EmailRepository.emitTx(client, rows) : [];

      await client.query("RELEASE SAVEPOINT email_notify");

      logger.debug("Emails emitted", {
        orderId: order.id,
        orderNumber: order.order_number,
        event,
        planned: rows.length,
        queued: ids.length,
      });

      return ids;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT email_notify").catch(() => {});
      await client.query("RELEASE SAVEPOINT email_notify").catch(() => {});

      logger.error("Email emit failed — the order change is kept", error, {
        orderId: order.id,
        event,
      });

      Sentry.captureException(error, {
        tags: { feature: "email-notifications", phase: "emit" },
        extra: { orderId: order.id, event },
      });

      return [];
    }
  },

  /**
   * Start sending rows that were just committed. Detached: an email must
   * never sit inside a checkout or behind an admin's click. The sweeper
   * picks up anything this misses.
   */
  dispatch(messageIds = []) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return;
    if (!env.email.enabled) return;

    for (const id of messageIds) {
      EmailService.deliver(id).catch((error) => {
        logger.warn("Email dispatch failed", { messageId: id, message: error?.message });
      });
    }
  },

  /**
   * Send one outbox row and record what happened. Idempotent through
   * `claim`, and through Resend's Idempotency-Key. Never throws.
   *
   * @returns {Promise<string>} what happened, for the caller's log
   */
  async deliver(messageId) {
    if (!env.email.enabled) return "not-configured";

    let message;

    try {
      message = await EmailRepository.claim(messageId);
    } catch (error) {
      logger.error("Could not claim email", error, { messageId });
      return "claim-failed";
    }

    if (!message) return "already-claimed";

    const attempts = Number(message.attempts ?? 1);

    if (attempts > MAX_ATTEMPTS) {
      await EmailRepository.markAttemptFailed(messageId, {
        retryable: false,
        errorCode: "ATTEMPTS_EXHAUSTED",
        errorDetail: `Gave up after ${attempts - 1} attempts`,
      });

      logger.error("Email given up on", {
        messageId,
        orderId: message.order_id,
        kind: message.kind,
        to: maskEmail(message.to_email),
      });

      Sentry.captureMessage("Email notification abandoned", {
        level: "error",
        tags: { feature: "email-notifications", phase: "deliver" },
        extra: { messageId, orderId: message.order_id, kind: message.kind },
      });

      return "exhausted";
    }

    try {
      const render = RENDERERS[message.kind];
      if (!render) throw new Error(`No template for email kind "${message.kind}"`);

      // Rendered from the order as it is now, so the packed email carries
      // the tracking number the admin entered with the transition.
      const order = await OrderRepository.findById(message.order_id);
      if (!order) throw new Error(`Order ${message.order_id} not found`);

      const { subject, html, text } = render(order);

      const { id: providerMessageId } = await EmailGateway.send({
        to: message.to_email,
        subject,
        html,
        text,
        idempotencyKey: message.dedupe_key,
      });

      await EmailRepository.markSent(messageId, { providerMessageId });

      logger.info("Email sent", {
        messageId,
        orderId: message.order_id,
        kind: message.kind,
        to: maskEmail(message.to_email),
      });

      return "sent";
    } catch (error) {
      if (!(error instanceof EmailSendError)) {
        // A bug or a database hiccup, not a send failure. Retryable: the
        // next attempt may run fixed code or find the database back.
        logger.error("Email delivery raised an unexpected error", error, { messageId });

        await EmailRepository.markAttemptFailed(messageId, {
          retryable: attempts < MAX_ATTEMPTS,
          errorCode: "UNEXPECTED",
          errorDetail: error?.message,
          backoffSeconds: retryBackoffSeconds(attempts),
        });

        return "error";
      }

      const retryable = error.retryable && attempts < MAX_ATTEMPTS;

      await EmailRepository.markAttemptFailed(messageId, {
        retryable,
        errorCode: error.code,
        errorDetail: error.message,
        backoffSeconds: retryBackoffSeconds(attempts),
      });

      if (!retryable) {
        logger.warn("Email will not be sent", {
          messageId,
          orderId: message.order_id,
          kind: message.kind,
          to: maskEmail(message.to_email),
          code: error.code,
          detail: error.message,
        });

        if (error.misconfigured) {
          Sentry.captureException(error, {
            level: "error",
            tags: { feature: "email-notifications", phase: "deliver" },
            extra: { messageId, code: error.code },
          });
        }
      }

      return retryable ? "retry" : "failed";
    }
  },

  /**
   * Send an email straight away, outside the outbox. For password reset
   * only — see the file header. Throws EmailSendError on failure.
   */
  async sendNow({ to, subject, html, text }) {
    return EmailGateway.send({ to, subject, html, text });
  },
};
