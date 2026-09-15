// src/repository/notification.repository.js
//
// The outbox, and the shop's own list of numbers.
//
// Two responsibilities in one file because they are two halves of one
// question — "who should be told, and were they?" — and splitting them
// would mean a service importing both to answer it.
//
// The important method here is `emitTx`. It takes a `client` rather than
// going to the pool, because it is called from inside the transaction
// that is making the state change it describes: the row that promises a
// message and the row that says the parcel shipped commit together, or
// neither does. Everything else in this file is ordinary.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { MESSAGE_STATUS, RECEIPT_TRANSITIONS } from "../config/whatsapp.policy.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Notification repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

// ============================================================
// COLUMN LISTS
// ============================================================

const MESSAGE_COLUMNS = `
  id, dedupe_key, order_id, event, audience, recipient_id, to_phone,
  template_name, template_language, params, status, attempts,
  next_attempt_at, provider_message_id, error_code, error_detail,
  created_at, updated_at, sent_at, delivered_at, failed_at
`;

const RECIPIENT_COLUMNS = `
  id, label, phone, is_active, created_by, created_at, updated_at
`;

/**
 * How long a row may sit in `sending` before it is assumed abandoned.
 *
 * A row in that state is a process that was killed between claiming the
 * message and recording what happened to it. Ten minutes is far longer
 * than the gateway's fifteen-second budget, so a live send is never
 * mistaken for a dead one.
 */
const STUCK_AFTER = "10 minutes";

// ============================================================
// THE IDEMPOTENCY KEY
// ============================================================

/**
 * The key that makes an emit safe to run twice.
 *
 * Dot-separated because a UUID, an event word and an E.164 number
 * contain no dots between them, so the parts cannot run together and
 * mint a collision between two different messages.
 *
 * `resend` is how the settings screen's "send again" gets past a key
 * that is otherwise final — a deliberate duplicate, asked for by a
 * human, rather than one caused by a retry.
 */
export const dedupeKey = ({ orderId, event, toPhone, resend = 0 }) =>
  resend > 0
    ? `${orderId}.${event}.${toPhone}.r${resend}`
    : `${orderId}.${event}.${toPhone}`;

export const NotificationRepository = {
  // ==========================================================
  // THE OUTBOX
  // ==========================================================

  /**
   * Write the intention to send, inside somebody else's transaction.
   *
   * `ON CONFLICT (dedupe_key) DO NOTHING` is the whole idempotency
   * mechanism of this feature. A row that is already there means this
   * exact message was already decided on, and the insert reports that by
   * returning nothing rather than by raising — the same shape as
   * PaymentRepository.settle's `alreadyPaid`.
   *
   * That is what makes the emit sites safe to call unconditionally. Two
   * admins clicking "Mark shipped" in two tabs, a Razorpay webhook
   * replayed from their dashboard, a checkout return racing the webhook
   * — all of them collapse here, in Postgres, rather than relying on a
   * flag somebody remembered to check.
   *
   * Takes `client`, never the pool. See the file header.
   *
   * @param {import('pg').PoolClient} client
   * @param {object[]} rows
   * @returns {Promise<string[]>} ids of the rows this call actually created
   */
  async emitTx(client, rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    // One statement for the whole batch. An order being paid for emits
    // to the customer and to every subscribed admin at once, and a
    // round trip each would put the shop's recipient count on the
    // critical path of a payment.
    const values = [];
    const placeholders = [];

    for (const [index, row] of rows.entries()) {
      const base = index * 11;

      placeholders.push(
        `($${base + 1}, $${base + 2}::uuid, $${base + 3}, $${base + 4}, ` +
          `$${base + 5}::uuid, $${base + 6}, $${base + 7}, $${base + 8}, ` +
          `$${base + 9}::jsonb, $${base + 10}, $${base + 11})`,
      );

      values.push(
        row.dedupeKey,
        row.orderId,
        row.event,
        row.audience,
        row.recipientId ?? null,
        row.toPhone,
        row.templateName,
        row.templateLanguage,
        JSON.stringify(row.params ?? []),
        row.status ?? MESSAGE_STATUS.PENDING,
        row.errorCode ?? null,
      );
    }

    const { rows: created } = await client.query(
      `INSERT INTO whatsapp_messages
         (dedupe_key, order_id, event, audience, recipient_id, to_phone,
          template_name, template_language, params, status, error_code)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id, status`,
      values,
    );

    // Only rows that will actually be sent are worth queueing. A
    // `skipped` row is a record, not a job.
    return created
      .filter((row) => row.status === MESSAGE_STATUS.PENDING)
      .map((row) => row.id);
  },

  /**
   * One message, by id. The worker's first act.
   */
  async findById(id) {
    try {
      const { rows } = await query(
        `SELECT ${MESSAGE_COLUMNS} FROM whatsapp_messages WHERE id = $1::uuid`,
        [id],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findById", { id });
    }
  },

  /**
   * Take ownership of a message so that nothing else sends it.
   *
   * Guarded on the status it expects to find, which is what stops the
   * queue worker and the sweeper both sending the same row: whichever
   * gets here second matches nothing and is told to leave it alone.
   *
   * `next_attempt_at` is pushed forward at the same moment, so a sweep
   * running while the worker is mid-call does not see the row as due.
   *
   * @returns {Promise<object|null>} the claimed row, or null
   */
  async claim(id, { backoffSeconds = 300 } = {}) {
    try {
      const { rows } = await query(
        `UPDATE whatsapp_messages
            SET status = $2,
                attempts = attempts + 1,
                next_attempt_at = NOW() + ($3 || ' seconds')::interval,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND status IN ($4, $5)
          RETURNING ${MESSAGE_COLUMNS}`,
        [
          id,
          MESSAGE_STATUS.SENDING,
          String(backoffSeconds),
          MESSAGE_STATUS.PENDING,
          MESSAGE_STATUS.SENDING,
        ],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "claim", { id });
    }
  },

  /**
   * What is owed, oldest first.
   *
   * Two clauses, for two different failures. `pending` past its due time
   * is a message whose enqueue never happened — no Redis, or a process
   * that died between the commit and the enqueue. `sending` that has sat
   * still for ten minutes is a process killed mid-call.
   *
   * FOR UPDATE SKIP LOCKED so that two API instances sweeping in the
   * same second take different rows rather than fighting over one.
   */
  async findDue(limit = 25) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT id
             FROM whatsapp_messages
            WHERE (status = $1 AND next_attempt_at <= NOW())
               OR (status = $2 AND updated_at < NOW() - INTERVAL '${STUCK_AFTER}')
            ORDER BY created_at
            LIMIT $3
            FOR UPDATE SKIP LOCKED`,
          [MESSAGE_STATUS.PENDING, MESSAGE_STATUS.SENDING, limit],
        );

        return rows.map((row) => row.id);
      });
    } catch (error) {
      throw handleDatabaseError(error, "findDue", { limit });
    }
  },

  async markSent(id, { providerMessageId }) {
    try {
      const { rows } = await query(
        `UPDATE whatsapp_messages
            SET status = $2,
                provider_message_id = $3,
                error_code = NULL,
                error_detail = NULL,
                sent_at = COALESCE(sent_at, NOW()),
                updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING ${MESSAGE_COLUMNS}`,
        [id, MESSAGE_STATUS.SENT, providerMessageId],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "markSent", { id });
    }
  },

  /**
   * Record a failure, and decide whether it may be tried again.
   *
   * `retryable` puts the row back to `pending` with a due time; anything
   * else closes it as `failed`. The decision is made by the gateway and
   * only recorded here — a repository that classified errors would be a
   * second place for that rule to live.
   */
  async markAttemptFailed(id, { retryable, errorCode, errorDetail, backoffSeconds = 60 }) {
    try {
      const { rows } = await query(
        `UPDATE whatsapp_messages
            SET status = CASE WHEN $2 THEN $3 ELSE $4 END,
                next_attempt_at = CASE
                  WHEN $2 THEN NOW() + ($5 || ' seconds')::interval
                  ELSE next_attempt_at
                END,
                failed_at = CASE WHEN $2 THEN failed_at ELSE NOW() END,
                error_code = $6,
                error_detail = $7,
                updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING ${MESSAGE_COLUMNS}`,
        [
          id,
          Boolean(retryable),
          MESSAGE_STATUS.PENDING,
          MESSAGE_STATUS.FAILED,
          String(backoffSeconds),
          errorCode ? String(errorCode).slice(0, 32) : null,
          errorDetail ? String(errorDetail).slice(0, 2000) : null,
        ],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "markAttemptFailed", { id });
    }
  },

  /**
   * Apply an inbound delivery receipt.
   *
   * Guarded on the states this receipt may advance from, because Meta's
   * receipts are not ordered: a `delivered` can arrive after the `read`
   * that logically follows it, and applying it blindly would walk the
   * row backwards.
   *
   * Returns null for an unknown wamid, which is ordinary rather than an
   * error — Meta also delivers receipts for messages this system never
   * sent, and the webhook must answer 200 either way.
   */
  async applyReceipt(providerMessageId, status, { at = null, errorCode = null, errorDetail = null } = {}) {
    const from = RECEIPT_TRANSITIONS[status];

    if (!from) return null;

    try {
      const { rows } = await query(
        `UPDATE whatsapp_messages
            SET status = $2,
                delivered_at = CASE WHEN $2 IN ($4, $5)
                  THEN COALESCE($3::timestamptz, NOW()) ELSE delivered_at END,
                failed_at = CASE WHEN $2 = $6
                  THEN COALESCE($3::timestamptz, NOW()) ELSE failed_at END,
                error_code = COALESCE($7, error_code),
                error_detail = COALESCE($8, error_detail),
                updated_at = NOW()
          WHERE provider_message_id = $1
            AND status = ANY($9::text[])
          RETURNING ${MESSAGE_COLUMNS}`,
        [
          providerMessageId,
          status,
          at,
          MESSAGE_STATUS.DELIVERED,
          MESSAGE_STATUS.READ,
          MESSAGE_STATUS.FAILED,
          errorCode ? String(errorCode).slice(0, 32) : null,
          errorDetail ? String(errorDetail).slice(0, 2000) : null,
          [...from],
        ],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "applyReceipt", { providerMessageId, status });
    }
  },

  /** Every message about one order — the strip on the admin order page. */
  async listByOrder(orderId) {
    try {
      const { rows } = await query(
        `SELECT ${MESSAGE_COLUMNS}
           FROM whatsapp_messages
          WHERE order_id = $1::uuid
          ORDER BY created_at DESC`,
        [orderId],
      );

      return rows;
    } catch (error) {
      throw handleDatabaseError(error, "listByOrder", { orderId });
    }
  },

  /**
   * How many resends this message has already had, so the next one gets
   * a key that has not been used.
   */
  async countResends(orderId, event, toPhone) {
    try {
      const { rows } = await query(
        `SELECT COUNT(*)::int AS n
           FROM whatsapp_messages
          WHERE order_id = $1::uuid AND event = $2 AND to_phone = $3`,
        [orderId, event, toPhone],
      );

      // The original is not a resend, so one row means zero resends.
      return Math.max((rows[0]?.n ?? 1) - 1, 0);
    } catch (error) {
      throw handleDatabaseError(error, "countResends", { orderId, event });
    }
  },

  // ==========================================================
  // RECIPIENTS
  // ==========================================================

  /**
   * Who should be told about this event, right now.
   *
   * Takes an optional `client` because the emit path calls it from
   * inside the transaction that is confirming a payment: the recipient
   * list has to be the one that was true at the moment of the
   * transition, and a second connection could read a different one.
   *
   * One index seek on a table with single-digit row counts —
   * idx_whatsapp_recipient_events_event exists for exactly this.
   */
  async findActiveForEvent(event, client = null) {
    const runner = client ? (text, params) => client.query(text, params) : query;

    try {
      const { rows } = await runner(
        `SELECT r.id, r.label, r.phone
           FROM whatsapp_recipients r
           JOIN whatsapp_recipient_events e ON e.recipient_id = r.id
          WHERE e.event = $1
            AND r.is_active
          ORDER BY r.created_at`,
        [event],
      );

      return rows;
    } catch (error) {
      throw handleDatabaseError(error, "findActiveForEvent", { event });
    }
  },

  /** The settings screen's list — every recipient, with their events. */
  async listRecipients() {
    try {
      const { rows } = await query(
        `SELECT ${RECIPIENT_COLUMNS.split(",").map((c) => `r.${c.trim()}`).join(", ")},
                COALESCE(
                  ARRAY_AGG(e.event ORDER BY e.event) FILTER (WHERE e.event IS NOT NULL),
                  '{}'
                ) AS events
           FROM whatsapp_recipients r
           LEFT JOIN whatsapp_recipient_events e ON e.recipient_id = r.id
          GROUP BY r.id
          ORDER BY r.created_at`,
      );

      return rows;
    } catch (error) {
      throw handleDatabaseError(error, "listRecipients");
    }
  },

  async findRecipientById(id) {
    try {
      const { rows } = await query(
        `SELECT ${RECIPIENT_COLUMNS.split(",").map((c) => `r.${c.trim()}`).join(", ")},
                COALESCE(
                  ARRAY_AGG(e.event ORDER BY e.event) FILTER (WHERE e.event IS NOT NULL),
                  '{}'
                ) AS events
           FROM whatsapp_recipients r
           LEFT JOIN whatsapp_recipient_events e ON e.recipient_id = r.id
          WHERE r.id = $1::uuid
          GROUP BY r.id`,
        [id],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findRecipientById", { id });
    }
  },

  /**
   * Add a number and its subscriptions together.
   *
   * One transaction, because a recipient with no events is a number that
   * will never be messaged — a half-applied create looks exactly like a
   * working one until the next order is paid for.
   */
  async createRecipient({ label, phone, events = [], createdBy = null }) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO whatsapp_recipients (label, phone, created_by)
           VALUES ($1, $2, $3::uuid)
           RETURNING id`,
          [label, phone, createdBy],
        );

        const id = rows[0].id;

        await replaceEvents(client, id, events);

        return id;
      });
    } catch (error) {
      throw handleDatabaseError(error, "createRecipient", { phone });
    }
  },

  /**
   * Change a recipient, replacing their whole event set.
   *
   * Replace rather than diff: the settings screen sends the state it
   * wants, and a DELETE plus an INSERT in one transaction is both
   * simpler to reason about and impossible to leave half-applied.
   */
  async updateRecipient(id, { label, phone, events }) {
    try {
      return await withTransaction(async (client) => {
        const { rows } = await client.query(
          `UPDATE whatsapp_recipients
              SET label = COALESCE($2, label),
                  phone = COALESCE($3, phone),
                  updated_at = NOW()
            WHERE id = $1::uuid
            RETURNING id`,
          [id, label ?? null, phone ?? null],
        );

        if (rows.length === 0) return null;

        // undefined means "leave the subscriptions alone"; an empty
        // array means "unsubscribe from everything", and those are
        // different instructions.
        if (Array.isArray(events)) {
          await replaceEvents(client, id, events);
        }

        return id;
      });
    } catch (error) {
      throw handleDatabaseError(error, "updateRecipient", { id });
    }
  },

  async setRecipientActive(id, isActive) {
    try {
      const { rows } = await query(
        `UPDATE whatsapp_recipients
            SET is_active = $2, updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id`,
        [id, Boolean(isActive)],
      );

      return rows[0]?.id ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "setRecipientActive", { id });
    }
  },

  async deleteRecipient(id) {
    try {
      // The events go with it — whatsapp_recipient_events cascades.
      // whatsapp_messages does not: those rows keep the number they were
      // sent to and set recipient_id to NULL, because the record of a
      // message that went out must survive the setting that caused it.
      const { rowCount } = await query(
        `DELETE FROM whatsapp_recipients WHERE id = $1::uuid`,
        [id],
      );

      return rowCount > 0;
    } catch (error) {
      throw handleDatabaseError(error, "deleteRecipient", { id });
    }
  },
};

/**
 * Set a recipient's subscriptions to exactly this list.
 *
 * Inside the caller's transaction, always — a delete that commits
 * without its insert is a number that silently stops being told
 * anything.
 */
async function replaceEvents(client, recipientId, events) {
  await client.query(
    `DELETE FROM whatsapp_recipient_events WHERE recipient_id = $1::uuid`,
    [recipientId],
  );

  if (!Array.isArray(events) || events.length === 0) return;

  // UNNEST rather than a built placeholder list: the array is small, and
  // this way the statement text is the same whatever its length, which
  // is one plan in Postgres's cache instead of one per subscription
  // count.
  await client.query(
    `INSERT INTO whatsapp_recipient_events (recipient_id, event)
     SELECT $1::uuid, e FROM UNNEST($2::text[]) AS e
     ON CONFLICT DO NOTHING`,
    [recipientId, events],
  );
}
