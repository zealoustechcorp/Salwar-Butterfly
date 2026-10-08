-- src/migrations/001_create_products.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- DROP TABLE IF EXISTS (for fresh migration)
-- ============================================================

DROP TABLE IF EXISTS products CASCADE;

-- ============================================================
-- CREATE PRODUCTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  category_id UUID NOT NULL,

  sub_category_id UUID NULL,

  name VARCHAR(200) NOT NULL,

  slug VARCHAR(255) NOT NULL UNIQUE,

  description TEXT NULL,

  base_price DECIMAL(10,2) NOT NULL
    CHECK (base_price >= 0),

  discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0
    CHECK (
      discount_percentage >= 0
      AND discount_percentage <= 100
    ),

  current_price DECIMAL(10,2) NOT NULL DEFAULT 0
    CHECK (current_price >= 0),

  is_featured BOOLEAN NOT NULL DEFAULT FALSE,

  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_products_sub_category
    FOREIGN KEY (sub_category_id)
    REFERENCES sub_categories(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug
  ON products (slug);

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (category_id);

CREATE INDEX IF NOT EXISTS idx_products_sub_category
  ON products (sub_category_id);

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (active);

CREATE INDEX IF NOT EXISTS idx_products_featured
  ON products (is_featured);

CREATE INDEX IF NOT EXISTS idx_products_price
  ON products (current_price);

CREATE INDEX IF NOT EXISTS idx_products_created_at
  ON products (created_at DESC);