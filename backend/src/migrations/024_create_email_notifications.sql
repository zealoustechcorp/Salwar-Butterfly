-- src/migrations/024_create_email_notifications.sql
--
-- Email, alongside WhatsApp (023).
--
-- Three things, because the emails need all three:
--
--   1. The shipment on the order. The "your order is packed" email
--      carries the courier and tracking number, so they have to live on
--      the order before the email can say them.
--   2. The email outbox. The same shape as whatsapp_messages and for the
--      same reason: the promise to send is written inside the
--      transaction that changes the order, and the send happens later
--      from the committed row. See email.service.js.
--   3. Password reset tokens.

-- ============================================================
-- 1. SHIPMENT
-- ============================================================
--
-- Entered by the admin when the order is marked packed. Nullable,
-- because every order placed before this migration has none and an
-- order that has not been packed yet has none either.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS courier_name VARCHAR(80) NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(80) NULL;

-- The courier's tracking page, where the admin has one. Optional: most
-- couriers can be tracked from the number alone.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_url VARCHAR(500) NULL;

-- ============================================================
-- 2. EMAIL OUTBOX
-- ============================================================
--
-- No rendered HTML is stored. A row says *which* email is owed about
-- *which* order; the body is rendered from the order at send time. That
-- keeps the table small and means a fixed template also fixes every
-- retry still waiting in here.

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- order id + kind + recipient. UNIQUE so an emit that runs twice for
  -- one transition produces one email. Also sent to Resend as the
  -- Idempotency-Key, so a retry after a timeout cannot deliver twice.
  dedupe_key VARCHAR(255) NOT NULL,

  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  kind VARCHAR(40) NOT NULL,

  audience VARCHAR(16) NOT NULL,

  to_email VARCHAR(255) NOT NULL,

  status VARCHAR(16) NOT NULL DEFAULT 'pending',

  attempts INTEGER NOT NULL DEFAULT 0,

  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Resend's email id, for looking a message up on their dashboard.
  provider_message_id VARCHAR(100) NULL,

  error_code VARCHAR(32) NULL,
  error_detail TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_email_messages_dedupe_key UNIQUE (dedupe_key),

  CONSTRAINT email_messages_kind_check
    CHECK (kind IN ('order_confirmed', 'order_packed', 'admin_new_order')),

  CONSTRAINT email_messages_audience_check
    CHECK (audience IN ('customer', 'admin')),

  CONSTRAINT email_messages_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),

  CONSTRAINT email_messages_attempts_check
    CHECK (attempts >= 0)
);

-- What the sweeper reads: only rows still owed a send.
CREATE INDEX IF NOT EXISTS idx_email_messages_due
  ON email_messages (next_attempt_at)
  WHERE status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS idx_email_messages_order
  ON email_messages (order_id, created_at DESC);

-- ============================================================
-- 3. PASSWORD RESET TOKENS
-- ============================================================
--
-- The token itself is never stored, only its SHA-256, matching
-- refresh_tokens: a copy of this table is not a set of working reset
-- links.
--
-- Single use (used_at) and short-lived (expires_at). Requesting a new
-- link burns any older unused one, so only the latest email works.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  token_hash CHAR(64) NOT NULL,

  expires_at TIMESTAMPTZ NOT NULL,

  used_at TIMESTAMPTZ NULL,

  requested_ip VARCHAR(64) NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_password_reset_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_customer
  ON password_reset_tokens (customer_id, created_at DESC);

-- A reset ends every session the account has, and says why. The reason
-- list is a CHECK in 022, so it is widened here rather than edited there.
ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS refresh_tokens_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_reason_check
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'logout',
      'reuse_detected',
      'rotated_out',
      'password_reset'
    ));
