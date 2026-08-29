-- ============================================================
-- CREATE CATEGORIES TABLE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(255) NOT NULL,

    slug VARCHAR(255) NOT NULL,

    description TEXT NULL,

    image TEXT NULL,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    deleted_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- CATEGORY SLUG UNIQUE INDEX
-- ============================================================
-- Only active categories must have unique slugs.
-- Deleted categories can reuse the slug.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique

ON categories (slug)

WHERE deleted_at IS NULL;


-- ============================================================
-- CATEGORY ACTIVE INDEX
-- ============================================================
-- Useful for fetching active categories.
-- ============================================================

CREATE INDEX IF NOT EXISTS categories_active_idx

ON categories (active)

WHERE deleted_at IS NULL;


-- ============================================================
-- CREATED AT INDEX
-- ============================================================
-- Useful for ORDER BY created_at DESC.
-- ============================================================

CREATE INDEX IF NOT EXISTS categories_created_at_idx

ON categories (created_at DESC);


-- ============================================================
-- DELETED AT INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS categories_deleted_at_idx

ON categories (deleted_at);