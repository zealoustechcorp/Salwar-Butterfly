-- src/migrations/034_create_admin_password_reset_tokens.sql
--
-- "Forgot password" for the admin panel.
--
-- Its own table rather than a second foreign key on
-- password_reset_tokens: admins and customers are separate tables on
-- purpose (see 002), and a token row that could point at either is one
-- bug away from a shopper's link resetting an admin password.
--
-- Same shape and rules as the customer table in 024: only the SHA-256 of
-- the token is stored, each token works once (used_at), expires_at is
-- short, and asking again burns any older unused link.

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,

  token_hash CHAR(64) NOT NULL,

  expires_at TIMESTAMPTZ NOT NULL,

  used_at TIMESTAMPTZ NULL,

  requested_ip VARCHAR(64) NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_admin_password_reset_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_admin
  ON admin_password_reset_tokens (admin_id, created_at DESC);

-- When the password last changed by reset. requireAdmin refuses any
-- access token issued before it, so a reset ends sessions at once rather
-- than when their fifteen-minute access tokens happen to run out.
-- NULL until the first reset: no token is refused on its account.
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;
