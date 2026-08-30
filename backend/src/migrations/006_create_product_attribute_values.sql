-- src/migrations/006_create_product_attribute_values.sql
--
-- The approved-values register behind the product attribute dropdowns.
--
-- `products.attributes` (003) stores what a product *is* — {"fabric":
-- "Cotton"}. This table stores what may be chosen, so the vocabulary is
-- curated once rather than retyped per product, where "Cotton",
-- "cotton " and "Coton" would all become separate values.
--
-- Rows are grouped by `group_name` ("fabric", "work", "sleeve") rather
-- than split into a table each, for the same reason 003 used one JSONB
-- column: which attributes matter grows over time, and a new group
-- should not need a migration.

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matches a key in products.attributes.
  group_name VARCHAR(40) NOT NULL,

  value VARCHAR(100) NOT NULL,

  -- Retiring a value hides it from new products without touching the
  -- ones already using it — the same rule the old approve/unapprove
  -- toggle had, now with somewhere durable to live.
  active BOOLEAN NOT NULL DEFAULT TRUE,

  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_product_attribute_values_group_value
    UNIQUE (group_name, value)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_group
  ON product_attribute_values (group_name, position);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_active
  ON product_attribute_values (active);
