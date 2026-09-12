-- src/migrations/020_add_banner_product.sql
--
-- A banner may name a piece, and then the slide is a link to it (F-06).
--
-- ------------------------------------------------------------
-- THIS REVERSES SOMETHING 017 SAID
-- ------------------------------------------------------------
--
-- 017_create_banners.sql is explicit, under a heading of its own:
--
--   "There is no title, no subtitle, no call to action and no link.
--    ... A slide is an image and a place in the order. That is the whole
--    model, and it is the model the shop asked for."
--
-- One quarter of that is now wrong, and it is worth being clear about
-- which quarter and why, rather than quietly widening the table.
--
-- The argument against a *caption* stands and is untouched here. A
-- headline already sits beside the carousel in the first fold, and a
-- second one composited into the slide would be two headlines arguing.
-- The shop still composes whatever it wants said into the artwork.
--
-- The argument against a *link* was different in kind, and weaker: it
-- was that a slide is decoration. But the artwork the shop actually
-- uploads is a photograph of a piece it is selling, and a shopper who
-- taps it is asking to see that piece. Today that tap does nothing,
-- which is the carousel behaving like a poster in a shop that is, in
-- fact, a shop. `customer_stories` (018) already drew this exact
-- conclusion for its own cards, in a column commented almost word for
-- word like the one below — the banner is the odd one out, not the
-- precedent.
--
-- What has NOT changed: a banner is still complete without this. The
-- column is nullable, most slides will leave it null, and a slide that
-- names nothing renders exactly as it does today — a photograph, with
-- alt="" beside the headline that already says the words.
--
-- ------------------------------------------------------------
-- WHY SET NULL AND NOT CASCADE
-- ------------------------------------------------------------
--
-- Deleting a product must not delete the shop's artwork. The slide is a
-- photograph the shop had made and put in the first fold of its home
-- page deliberately; the piece it happened to point at selling out is
-- not a reason to take the fold apart. The link stops working and the
-- picture stays, which is `customer_stories.product_id`'s reasoning and
-- the opposite of `reviews.product_id`, where the row is *about* the
-- product and goes with it.
--
-- Note that this is the weaker of the two protections. A product that is
-- merely taken off sale — `active = FALSE`, far commoner than a delete —
-- keeps the row untouched; it is the storefront's join that is filtered
-- on `p.active`, so the slide simply stops linking. See BANNERS_SQL in
-- repository/storefront.repository.js.

ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS product_id UUID NULL;

-- Guarded, because ADD CONSTRAINT has no IF NOT EXISTS in the Postgres
-- versions this has to run on, and the runner is re-runnable by design.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_banners_product'
  ) THEN
    ALTER TABLE banners
      ADD CONSTRAINT fk_banners_product
        FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
--
-- "Which slides point at this piece" — what makes the SET NULL above
-- cheap, and what an admin screen would read before deleting a product.
-- Partial, because the ordinary banner names nothing and there is no
-- question this index answers about those rows.

CREATE INDEX IF NOT EXISTS idx_banners_product
  ON banners (product_id)
  WHERE product_id IS NOT NULL;
