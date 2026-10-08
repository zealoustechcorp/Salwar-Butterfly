-- src/migrations/011_create_wishlist_items.sql
--
-- Saved pieces (F-07).
--
-- The wishlist lived in the browser's localStorage, keyed by the
-- signed-in shopper's id — which promised something the storage could not
-- keep. Keying by account only means the pieces are hidden from the next
-- person to use the same laptop; it does not make them follow the shopper
-- to their phone, and a saved piece that vanishes when you pick up a
-- different device reads as a bug in the shop.
--
-- The bag deliberately stays in the browser. A bag is a five-minute
-- intention that ends at checkout, it must work for guests who will never
-- have a row here, and syncing it would mean resolving conflicts between
-- two devices over something the shopper is about to spend anyway. A
-- wishlist is the opposite on all three counts.
--
-- The unit is the product, not the variant. Saving is "I like this
-- piece"; which size to take is a decision made on the product page at
-- the moment of buying, and a wishlist keyed by variant would show the
-- same kurta three times.

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id UUID NOT NULL,

  product_id UUID NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Saving something already saved is not an error, it is a no-op — the
  -- heart on a card is a toggle and it will be double-tapped. This
  -- constraint is what lets the write be an idempotent
  -- ON CONFLICT DO NOTHING instead of a read-then-write race.
  CONSTRAINT uq_wishlist_customer_product
    UNIQUE (customer_id, product_id),

  CONSTRAINT fk_wishlist_customer
    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- CASCADE, unlike order_items, and for the opposite reason. An order
  -- line is evidence that a sale happened and must outlive the product;
  -- a wishlist entry pointing at a product the shop no longer stocks is
  -- just a broken card on a page.
  CONSTRAINT fk_wishlist_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- ============================================================
-- INDEXES
-- ============================================================

-- "My wishlist", newest saved first — the only query the storefront
-- makes. The UNIQUE constraint above already covers (customer_id,
-- product_id), but not the created_at ordering this reads in.
CREATE INDEX IF NOT EXISTS idx_wishlist_customer_created
  ON wishlist_items (customer_id, created_at DESC);

-- "How many people have saved this piece" — worth an index because it is
-- the one report the shop will want out of this table, and because
-- deleting a product has to find these rows to cascade them.
CREATE INDEX IF NOT EXISTS idx_wishlist_product
  ON wishlist_items (product_id);
