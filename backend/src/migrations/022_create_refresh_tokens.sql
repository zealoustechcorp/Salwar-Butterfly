-- src/migrations/022_create_refresh_tokens.sql
--
-- The server side of a session.
--
-- Until this table existed, a signed-in admin or shopper was a JWT and
-- nothing else. That made logout a fiction: the endpoint wrote an audit
-- line and returned 200, and the token it claimed to have revoked went
-- on working until its own expiry, because a JWT carries its own
-- authority and the server keeps no record to consult. A leaked admin
-- token could not be withdrawn at all — the only lever was rotating
-- JWT_SECRET, which signs out every shopper in the shop at once.
--
-- A row here is that record. The access token stays stateless and short
-- (fifteen minutes, verified by signature alone, exactly as before); the
-- long-lived half becomes a row that can be marked revoked. Logout is
-- then an UPDATE, and a session ends within one access-token lifetime
-- instead of within a day.
--
-- Nothing here is a credential. `token_hash` is SHA-256 of the token,
-- so a copy of this table is not a set of usable sessions — the same
-- reasoning that keeps plaintext passwords out of `admins`.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ----------------------------------------------------------
  -- FAMILY
  -- ----------------------------------------------------------
  --
  -- Every refresh rotates: the presented token is burned and a new one
  -- issued, both in the family the original login opened. So one sign-in
  -- is one family and a chain of rows, and the current row is the only
  -- one in it with used_at IS NULL.
  --
  -- The family is what revocation acts on. Ending a session means
  -- revoking a family, which is one statement whether the shopper has
  -- refreshed twice or four hundred times.
  --
  -- It is also what makes theft detectable. A rotated-out token should
  -- never be presented again — the legitimate client has replaced it. If
  -- one is, two parties are holding the same credential, and since there
  -- is no way to tell which of the two is the thief, the entire family
  -- is revoked. The attacker's rotations die with it, and the real owner
  -- signs in again with a password the attacker does not have.

  family_id UUID NOT NULL,

  -- ----------------------------------------------------------
  -- SUBJECT
  -- ----------------------------------------------------------
  --
  -- No foreign key, and that is not an oversight: the subject is a row
  -- in `admins` OR in `customers`, and Postgres has no way to point one
  -- column at either. `typ` is the discriminator — the same claim the
  -- tokens have always carried and the same value `requireAdmin` and
  -- `requireCustomer` check.
  --
  -- The cost is that deleting an account leaves its rows behind. That is
  -- handled where it matters rather than by the schema: both services
  -- re-read the account on every /me call, so a deleted or deactivated
  -- subject stops being able to use a session even while its rows exist,
  -- and the expiry sweep clears them in time.

  subject_id UUID NOT NULL,

  typ VARCHAR(16) NOT NULL,

  -- ----------------------------------------------------------
  -- THE TOKEN
  -- ----------------------------------------------------------
  --
  -- SHA-256 hex of the refresh JWT. UNIQUE, which is load-bearing twice
  -- over: it is the lookup key on every refresh, and it makes a
  -- duplicate row impossible even if two requests somehow signed an
  -- identical token.

  token_hash CHAR(64) NOT NULL,

  expires_at TIMESTAMPTZ NOT NULL,

  -- ----------------------------------------------------------
  -- LIFECYCLE
  -- ----------------------------------------------------------
  --
  -- used_at     when this token was exchanged for a new one. Set once,
  --             by the rotation that replaced it. A second presentation
  --             of a row that already has this set is the reuse signal.
  --
  -- revoked_at  when the row stopped being usable, for any reason. Set
  --             in bulk across a family by logout and by reuse
  --             detection.
  --
  -- Both are nullable timestamps rather than booleans because "when"
  -- answers the support question and "whether" does not.

  used_at TIMESTAMPTZ NULL,

  revoked_at TIMESTAMPTZ NULL,

  -- 'logout' | 'reuse_detected' | 'rotated_out'. Kept for the
  -- conversation that starts "why was I signed out?" — read by people,
  -- never branched on by code.
  revoked_reason VARCHAR(32) NULL,

  -- ----------------------------------------------------------
  -- PROVENANCE
  -- ----------------------------------------------------------
  --
  -- Recorded so a shopper can eventually be shown "signed in on Chrome,
  -- Windows, 12 September" and revoke one device. Nothing reads them
  -- yet. They are not used for authorization and must not be: both are
  -- client-supplied and a session that changed networks is ordinary, not
  -- suspicious.

  user_agent TEXT NULL,

  ip INET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_refresh_tokens_hash
    UNIQUE (token_hash),

  CONSTRAINT refresh_tokens_typ_check
    CHECK (typ IN ('admin', 'customer')),

  CONSTRAINT refresh_tokens_reason_check
    CHECK (revoked_reason IS NULL OR revoked_reason IN (
      'logout',
      'reuse_detected',
      'rotated_out'
    ))
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Revocation: logout and reuse detection both act on a whole family.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family
  ON refresh_tokens (family_id);

-- "End every session this account has" — the lever for a compromised
-- password, and the basis of a future "sign out everywhere" button.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_subject
  ON refresh_tokens (typ, subject_id);

-- The expiry sweep. Partial, because a row that is already revoked is
-- not what the sweep is looking for and there is no reason to index it.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
  ON refresh_tokens (expires_at)
  WHERE revoked_at IS NULL;
