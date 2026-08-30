-- src/migrations/004_create_product_variants.sql
--
-- The sellable unit. A product is a listing; a variant is the row a
-- shopper actually buys, and the row stock is counted against.
--
-- One row per (product, size). Size lives here rather than as an array
-- on products because each size carries its own stock — "S sold out, M
-- has 12 left" is not expressible in a list of labels.
--
-- Colour is deliberately absent for now. When it arrives it becomes
-- another column here and the unique constraint widens to
-- (product_id, size, colour); nothing else about this table changes.

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL,

  -- "S", "M", "XL", "XXL", "38", "Free Size" — free text, because size
  -- naming differs by garment and a fixed enum would need a migration
  -- every time the catalogue grows a new one.
  size VARCHAR(20) NOT NULL,

  stock_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (stock_quantity >= 0),

  -- Lets a size be taken off sale without losing its stock count or its
  -- history. Deactivating is how a size is retired; deleting is only for
  -- one entered by mistake.
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- A product cannot list the same size twice.
  CONSTRAINT uq_product_variants_product_size
    UNIQUE (product_id, size)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_product_variants_product
  ON product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_active
  ON product_variants (active);

-- "what is out of stock" / "what is running low" across the catalogue
CREATE INDEX IF NOT EXISTS idx_product_variants_stock
  ON product_variants (stock_quantity);
