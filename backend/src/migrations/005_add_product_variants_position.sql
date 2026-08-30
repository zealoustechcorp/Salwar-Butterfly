-- src/migrations/005_add_product_variants_position.sql
--
-- Display order for a product's sizes.
--
-- 004 ordered variants by created_at, which does not work: a whole size
-- set is written in one transaction, so every row shares a timestamp and
-- the order comes back arbitrary — S, M, L, XL could render as L, S, XL,
-- M. Sorting on the size text is no better, since "L" < "M" < "S"
-- alphabetically and "10" < "8" numerically.
--
-- So the order is stored. The admin form sends sizes in the order it
-- shows them, and that index is kept here.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_product_variants_position
  ON product_variants (product_id, position);
