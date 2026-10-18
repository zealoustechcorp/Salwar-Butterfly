-- Matches the live table. The shop database had this table before the
-- migrations were written, so this file was never what built it, and its
-- first version (BIGSERIAL ids, TIMESTAMP, global UNIQUE on name and slug)
-- could not build a working database: products.category_id is a UUID.
-- The partial unique index on slug is 027_catalogue_partial_unique.sql.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  description TEXT,
  image TEXT,
  image_public_id TEXT,
  fits JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active);
CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON categories(created_at);
CREATE INDEX IF NOT EXISTS categories_name_idx ON categories(name);
CREATE INDEX IF NOT EXISTS categories_created_at_idx ON categories(created_at DESC);
CREATE INDEX IF NOT EXISTS categories_active_idx ON categories(active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS categories_deleted_at_idx ON categories(deleted_at);
