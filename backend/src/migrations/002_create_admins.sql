-- ============================================================
-- CREATE ADMINS TABLE
-- ============================================================
--
-- Admins are deliberately a separate table from `customers`.
-- A storefront account must never be able to become an admin by
-- flipping a column, and the two identities have different
-- lifecycles: customers self-register, admins are provisioned
-- with `npm run admin:create`.
--
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    email VARCHAR(255) NOT NULL,

    -- bcrypt hash, always exactly 60 characters
    password CHAR(60) NOT NULL,

    role VARCHAR(32) NOT NULL DEFAULT 'admin',

    active BOOLEAN NOT NULL DEFAULT TRUE,

    last_login_at TIMESTAMPTZ NULL,

    deleted_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT admins_role_check
        CHECK (role IN ('admin', 'super_admin'))
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
--
-- The unique index is partial so a soft-deleted admin frees its
-- email for re-use, matching the `customers` convention.
--
-- ------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS admins_email_unique
    ON admins (email)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS admins_created_at_idx
    ON admins (created_at);

CREATE INDEX IF NOT EXISTS admins_deleted_at_idx
    ON admins (deleted_at);
