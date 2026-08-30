-- src/migrations/009_create_order_items.sql
--
-- The lines of an order (F-07). One row per size bought.
--
-- The unit is the variant, not the product, for the same reason the
-- variant is the sellable unit everywhere else: "two of this kurta" is
-- not an order the shop can pick, and "two of this kurta in M" is.
--
-- Everything a receipt needs to render is copied onto the row.
--
--   product_name, size, image_url   the product may be renamed,
--                                   re-photographed, deactivated or
--                                   deleted; the receipt must not
--                                   change when it is.
--
--   unit_price                      the price agreed at checkout. If
--                                   this were read from
--                                   products.current_price, tonight's
--                                   discount would restate every order
--                                   ever placed, and the sum of the
--                                   lines would stop matching the total
--                                   the gateway actually charged.
--
-- The ids are kept alongside the snapshot, nullable, so the admin can
-- still click through from a line to the live product where one still
-- exists. They are for navigation; the snapshot is the record.

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  -- ----------------------------------------------------------
  -- LINKS BACK TO THE LIVE CATALOGUE
  -- ----------------------------------------------------------
  --
  -- SET NULL, never CASCADE. Deleting a product must not delete the
  -- evidence that it was sold — that would take money out of the
  -- shop's own reporting.

  product_id UUID NULL,

  variant_id UUID NULL,

  -- ----------------------------------------------------------
  -- SNAPSHOT
  -- ----------------------------------------------------------

  product_name VARCHAR(200) NOT NULL,

  product_slug VARCHAR(255) NULL,

  -- Nullable because a product may genuinely have no sizes. Everything
  -- in this catalogue does today, but the schema should not insist.
  size VARCHAR(20) NULL,

  -- The cover photo as it was. A gallery is re-ordered often; a receipt
  -- showing a different picture each time it is opened looks broken.
  image_url TEXT NULL,

  unit_price DECIMAL(10,2) NOT NULL
    CHECK (unit_price >= 0),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  -- Generated, not written. There is no code path that can get this
  -- wrong because there is no code path that sets it.
  line_total DECIMAL(10,2)
    GENERATED ALWAYS AS (unit_price * quantity) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT fk_order_items_variant
    FOREIGN KEY (variant_id)
    REFERENCES product_variants(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);

-- "How many of this have we sold?" — the report F-11 will want, and the
-- reason variant_id is kept at all.
CREATE INDEX IF NOT EXISTS idx_order_items_variant
  ON order_items (variant_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON order_items (product_id);

-- ============================================================
-- ONE LINE PER SIZE PER ORDER
-- ============================================================
--
-- The bag merges duplicates before it is sent, so two lines for the
-- same size in one order means something upstream is broken. Enforced
-- here as well, because "2 × M" and "1 × M, 1 × M" are the same order
-- to a shopper and two different rows to every report over this table.
--
-- Partial: a line whose variant was later deleted has variant_id NULL,
-- and NULLs are distinct in a unique index — an order that lost two
-- deleted variants must not become unrepresentable.

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_order_variant
  ON order_items (order_id, variant_id)
  WHERE variant_id IS NOT NULL;
