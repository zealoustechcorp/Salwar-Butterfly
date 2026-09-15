// src/services/notification.service.js
//
// Deciding who to tell, and telling them.
//
// Two halves that must never be confused:
//
//   emitTx    runs inside the transaction that is changing an order.
//             Writes the intention to send and nothing else. Cannot
//             reach the network, and cannot fail the order.
//   deliver   runs later, on its own, from a committed row. Talks to
//             Meta. May fail freely.
//
// The split is the whole safety property of this feature. An order is
// the money event and a notification is a courtesy, so the courtesy is
// not allowed to be on the critical path of the money.
//
// ── Why the emit is inside the transaction ──────────────────
//
// Because the transition and the promise to announce it have to commit
// together. Writing the outbox row after the commit would leave a window
// in which the order shipped and nothing recorded that anybody was owed
// a message — and nothing could later reconstruct it, because a shipped
// order looks identical whether or not its message was written.
//
// ── Why that needs a SAVEPOINT ──────────────────────────────
//
// This is the part that is easy to get wrong. Inside a Postgres
// transaction a failed statement poisons the whole transaction: every
// subsequent statement fails with 25P02 until it is rolled back. So the
// obvious `try { insert } catch { log }` does NOT protect the order — it
// swallows the error and then the COMMIT fails anyway, and a shopper who
// paid gets a 500 because a notification table had a bad constraint.
//
// A SAVEPOINT is the only construction that gives both halves of what is
// wanted: exactly-once with the transition, and an order that still
// succeeds when this fails.

import * as Sentry from "@sentry/node";

import { env } from "../config/env.js";
import { WhatsAppGateway, WhatsAppSendError } from "../config/whatsapp.gateway.js";
import {
  MESSAGE_STATUS,
  NOTIFY_AUDIENCE,
  SKIP_REASON,
  buildParams,
  orderContext,
  templateFor,
} from "../config/whatsapp.policy.js";
import { NotificationRepository, dedupeKey } from "../repository/notification.repository.js";
import { logger } from "../utils/logger.js";
import { maskPhone, toE164 } from "../utils/phone.js";

/**
 * How long a retryable failure waits before the sweeper picks it up.
 *
 * A minute, growing with the number of attempts already made, so that a
 * Meta throttle is not answered by a tight loop.
 */
const retryBackoffSeconds = (attempts) => Math.min(60 * 2 ** Math.max(attempts - 1, 0), 3_600);

/**
 * How many attempts a message gets before it is given up on.
 *
 * Six, which with the backoff above spans about an hour — long enough to
 * ride out a Meta incident, short enough that a genuinely undeliverable
 * message stops occupying the sweeper.
 */
const MAX_ATTEMPTS = 6;

/**
 * An ambiguous failure gets exactly one more attempt, ever.
 *
 * A timeout or an unreadable 2xx may already have reached the handset,
 * and Meta's /messages endpoint has no idempotency key to collapse a
 * repeat. One retry accepts a small chance of a duplicate in exchange
 * for not silently losing a message; a second would be trading somebody
 * else's phone for our own comfort.
 */
const MAX_AMBIGUOUS_ATTEMPTS = 2;

// ============================================================
// PLANNING
// ============================================================

/**
 * Work out every message this event should produce.
 *
 * Returns rows ready for the outbox, including the ones that will never
 * be sent — a shopper who opted out still gets a `skipped` row, because
 * "we never told her" is a question the shop will eventually ask and
 * silence is not an answer to it.
 *
 * @param {import('pg').PoolClient} client  the caller's transaction
 * @param {object} order   a raw `orders` row
 * @param {string} event   one of NOTIFY_EVENT
 */
async function planOrderEvent(client, order, event, { unitCount = null } = {}) {
  const ctx = orderContext(order, { unitCount });
  const rows = [];

  const add = ({ audience, toPhone, recipientId = null, status, errorCode = null }) => {
    const template = templateFor(audience, event);

    // No template for this pairing means this audience is simply not
    // told about this event. Not an error, and not a row.
    if (!template) return;

    rows.push({
      dedupeKey: dedupeKey({ orderId: order.id, event, toPhone }),
      orderId: order.id,
      event,
      audience,
      recipientId,
      toPhone,
      templateName: template.name,
      templateLanguage: template.language,
      params: buildParams(audience, event, ctx) ?? [],
      status,
      errorCode,
    });
  };

  // ---- the shopper ----------------------------------------
  //
  // The phone is taken from the order, not from the customer account:
  // it is the number they typed into this checkout, and it is the number
  // the consent below was given for.

  const customerPhone = toE164(order.contact_phone);

  if (!order.whatsapp_opt_in) {
    // The expected outcome for a good share of orders, especially early
    // on. Recorded as skipped so the admin screen can say "they asked
    // not to be messaged" rather than showing a gap.
    if (customerPhone) {
      add({
        audience: NOTIFY_AUDIENCE.CUSTOMER,
        toPhone: customerPhone,
        status: MESSAGE_STATUS.SKIPPED,
        errorCode: SKIP_REASON.NO_OPT_IN,
      });
    }
  } else if (!customerPhone) {
    // The number in the order cannot be turned into something Meta can
    // route. Recorded against the raw value, truncated to the column, so
    // somebody can see what was actually typed.
    add({
      audience: NOTIFY_AUDIENCE.CUSTOMER,
      toPhone: String(order.contact_phone ?? "").slice(0, 20) || "unknown",
      status: MESSAGE_STATUS.SKIPPED,
      errorCode: SKIP_REASON.UNUSABLE_PHONE,
    });
  } else {
    add({
      audience: NOTIFY_AUDIENCE.CUSTOMER,
      toPhone: customerPhone,
      status: env.whatsapp.enabled ? MESSAGE_STATUS.PENDING : MESSAGE_STATUS.SKIPPED,
      errorCode: env.whatsapp.enabled ? null : SKIP_REASON.NOT_CONFIGURED,
    });
  }

  // ---- the shop -------------------------------------------
  //
  // Read inside the caller's transaction so the list is the one that was
  // true at the moment of the transition.

  const recipients = await NotificationRepository.findActiveForEvent(event, client);

  for (const recipient of recipients) {
    add({
      audience: NOTIFY_AUDIENCE.ADMIN,
      toPhone: recipient.phone,
      recipientId: recipient.id,
      status: env.whatsapp.enabled ? MESSAGE_STATUS.PENDING : MESSAGE_STATUS.SKIPPED,
      errorCode: env.whatsapp.enabled ? null : SKIP_REASON.NOT_CONFIGURED,
    });
  }

  return rows;
}

export const NotificationService = {
  /**
   * Record what should be sent, inside the caller's transaction.
   *
   * Never throws. A failure here leaves the order change intact and
   * nobody messaged about it, which is the right way round — see the
   * SAVEPOINT discussion in the file header.
   *
   * @param {import('pg').PoolClient} client  the caller's open transaction
   * @param {object} order  a raw `orders` row, already updated
   * @param {string} event  one of NOTIFY_EVENT
   * @returns {Promise<string[]>} ids of rows that now need sending
   */
  async emitTx(client, order, event, options = {}) {
    if (!order?.id || !event) return [];

    // A SAVEPOINT rather than a bare try/catch. Without it, a failed
    // INSERT below aborts the caller's transaction and takes the order
    // change down with it — the exact opposite of what this guard is
    // for. See the file header.
    await client.query("SAVEPOINT notify");

    try {
      const rows = await planOrderEvent(client, order, event, options);

      if (rows.length === 0) {
        await client.query("RELEASE SAVEPOINT notify");
        return [];
      }

      const ids = await NotificationRepository.emitTx(client, rows);

      await client.query("RELEASE SAVEPOINT notify");

      // `debug`: this fires on every order event, and the rows it
      // describes are in the outbox table where they can be queried.
      // What matters at `info` and above is a message that will never
      // go out, which is logged below.
      logger.debug("Notifications emitted", {
        orderId: order.id,
        orderNumber: order.order_number,
        event,
        planned: rows.length,
        queued: ids.length,
      });

      return ids;
    } catch (error) {
      // Undo only what this block did. The caller's transaction is
      // usable again after this, which is the whole point.
      await client.query("ROLLBACK TO SAVEPOINT notify").catch(() => {});
      await client.query("RELEASE SAVEPOINT notify").catch(() => {});

      logger.error("Notification emit failed — the order change is kept", error, {
        orderId: order.id,
        event,
      });

      Sentry.captureException(error, {
        tags: { feature: "whatsapp-notifications", phase: "emit" },
        extra: { orderId: order.id, event },
      });

      return [];
    }
  },

  /**
   * Start sending rows that were just committed.
   *
   * Called after the transaction, deliberately: a send that began before
   * the commit landed would read an order that is still awaiting
   * payment.
   *
   * Detached and never awaited by the caller. The alternative — waiting
   * — would put a ten-second Meta call inside a checkout or behind an
   * admin's "Mark shipped" click, which is the exact latency the outbox
   * exists to avoid. Nothing is lost by not waiting: the rows are
   * committed, and the sweeper is underneath everything.
   *
   * @param {string[]} messageIds
   */
  dispatch(messageIds = []) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return;
    if (!env.whatsapp.enabled) return;

    for (const id of messageIds) {
      // Deliberately floating. `deliver` swallows its own failures and
      // the sweeper retries anything left behind, so there is nothing
      // here for a caller to await or to catch.
      NotificationService.deliver(id).catch((error) => {
        logger.warn("Notification dispatch failed", { messageId: id, message: error?.message });
      });
    }
  },

  /**
   * Send one message, and record what happened.
   *
   * Idempotent by way of `claim`: two callers racing for the same row —
   * the dispatch above and a sweep, say — produce one send, because the
   * second finds the row already claimed and leaves it alone.
   *
   * Never throws. Every outcome is a row update.
   *
   * @returns {Promise<string>} what happened, for the caller's log
   */
  async deliver(messageId) {
    if (!env.whatsapp.enabled) return "not-configured";

    let message;

    try {
      message = await NotificationRepository.claim(messageId);
    } catch (error) {
      logger.error("Could not claim notification", error, { messageId });
      return "claim-failed";
    }

    // Somebody else has it, or it is already sent, failed or skipped.
    if (!message) return "already-claimed";

    const attempts = Number(message.attempts ?? 1);

    // The gateway classifies an ambiguous failure as not retryable, so
    // this cap only bites when a *previous* attempt was ambiguous and a
    // sweep picked the row up again.
    if (attempts > MAX_ATTEMPTS) {
      await NotificationRepository.markAttemptFailed(messageId, {
        retryable: false,
        errorCode: "ATTEMPTS_EXHAUSTED",
        errorDetail: `Gave up after ${attempts - 1} attempts`,
      });

      logger.error("Notification given up on", {
        messageId,
        orderId: message.order_id,
        event: message.event,
        audience: message.audience,
        to: maskPhone(message.to_phone),
        attempts: attempts - 1,
      });

      // Deliberately `error` and not `fatal`. The webhook worker's fatal
      // is a paid order that may never be confirmed; this is a message
      // that did not arrive. Waking somebody at three in the morning for
      // the second is how the first stops meaning anything.
      Sentry.captureMessage("WhatsApp notification abandoned", {
        level: "error",
        tags: { feature: "whatsapp-notifications", phase: "deliver" },
        extra: {
          messageId,
          orderId: message.order_id,
          event: message.event,
          template: message.template_name,
        },
      });

      return "exhausted";
    }

    try {
      const { messageId: providerMessageId } = await WhatsAppGateway.sendTemplate({
        to: message.to_phone,
        name: message.template_name,
        language: message.template_language,
        params: Array.isArray(message.params) ? message.params : [],
      });

      await NotificationRepository.markSent(messageId, { providerMessageId });

      return "sent";
    } catch (error) {
      if (!(error instanceof WhatsAppSendError)) {
        // Something that is not a send failure at all — a bug in this
        // file, most likely. Retryable, because the next attempt runs
        // the fixed code.
        logger.error("Notification delivery raised an unexpected error", error, { messageId });

        await NotificationRepository.markAttemptFailed(messageId, {
          retryable: attempts < MAX_ATTEMPTS,
          errorCode: "UNEXPECTED",
          errorDetail: error?.message,
          backoffSeconds: retryBackoffSeconds(attempts),
        });

        return "error";
      }

      // An ambiguous failure may already have been delivered. It gets
      // one more attempt and no more — see MAX_AMBIGUOUS_ATTEMPTS.
      const retryable = error.ambiguous
        ? attempts < MAX_AMBIGUOUS_ATTEMPTS
        : error.retryable && attempts < MAX_ATTEMPTS;

      await NotificationRepository.markAttemptFailed(messageId, {
        retryable,
        errorCode: error.ambiguous && !retryable ? "UNKNOWN_OUTCOME" : error.code,
        errorDetail: error.detail ?? error.message,
        backoffSeconds: retryBackoffSeconds(attempts),
      });

      if (!retryable) {
        logger.warn("Notification will not be sent", {
          messageId,
          orderId: message.order_id,
          event: message.event,
          to: maskPhone(message.to_phone),
          kind: error.kind,
          code: error.code,
        });

        // A misconfiguration takes down every message at once — an
        // expired token, an unregistered number — so unlike an
        // undeliverable recipient it is worth an alert.
        if (error.kind === "misconfigured") {
          Sentry.captureException(error, {
            level: "error",
            tags: { feature: "whatsapp-notifications", phase: "deliver", kind: error.kind },
            extra: { messageId, code: error.code, detail: error.detail },
          });
        }
      }

      return retryable ? "retry" : "failed";
    }
  },

  /** Every message about one order — for the admin order page. */
  listForOrder(orderId) {
    return NotificationRepository.listByOrder(orderId);
  },
};
