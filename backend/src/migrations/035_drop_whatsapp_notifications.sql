-- src/migrations/035_drop_whatsapp_notifications.sql
--
-- WhatsApp notifications are gone; email is the only channel.
--
--   1. Drop everything 023 created: the three tables and the opt-in
--      columns on orders. The storefront keeps its wa.me contact links,
--      which never touched the database.
--   2. Widen the email outbox to the three events that used to be
--      WhatsApp-only — shipped, delivered and cancelled. Mirrors
--      EMAIL_KIND in src/config/email.policy.js.

-- ============================================================
-- 1. WHATSAPP
-- ============================================================

-- Children first: whatsapp_messages and whatsapp_recipient_events both
-- reference whatsapp_recipients.
DROP TABLE IF EXISTS whatsapp_messages;
DROP TABLE IF EXISTS whatsapp_recipient_events;
DROP TABLE IF EXISTS whatsapp_recipients;

ALTER TABLE orders DROP COLUMN IF EXISTS whatsapp_opt_in;
ALTER TABLE orders DROP COLUMN IF EXISTS whatsapp_opt_in_at;

-- ============================================================
-- 2. EMAIL KINDS
-- ============================================================

ALTER TABLE email_messages
  DROP CONSTRAINT IF EXISTS email_messages_kind_check;

ALTER TABLE email_messages
  ADD CONSTRAINT email_messages_kind_check
    CHECK (kind IN (
      'order_confirmed',
      'order_packed',
      'order_shipped',
      'order_delivered',
      'order_cancelled',
      'admin_new_order'
    ));
