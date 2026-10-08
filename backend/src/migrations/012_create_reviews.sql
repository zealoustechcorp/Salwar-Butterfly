-- src/migrations/012_create_reviews.sql
--
-- Reviews and ratings (F-11.06).
--
-- The FRS puts this under Dashboard & Reports, and the wording is
-- precise about why: "add, update, and delete reviews and ratings
-- (admin-only page)". There is no route by which a shopper writes one.
-- The shop collects what customers say on WhatsApp and on the phone and
-- publishes it, which is how a single-seller boutique this size
-- actually works — and it is the reason this table has no moderation
-- queue, no reporting flow and no per-customer write limit. Nobody but
-- the shop can put a row in it.
--
-- That also decides the columns. `author_name` is a plain string the
-- admin types, not a join: the person being quoted may well have no
-- account, and where they do have one their display name is still a
-- snapshot — a customer who later corrects the spelling of their name
-- must not silently rewrite a review published months ago.
--
-- `customer_id` is the optional link back to that account, kept for the
-- one question the shop will ask ("has this person bought from us?")
-- and for nothing else. It is nullable, and it stays nullable.
--
-- Storefront display (F-06.08) is a separate feature and is not built.
-- The `published` column and the index below exist so that adding it is
-- a read, not a migration.

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL,

  -- The account this quote came from, where there is one. Never the
  -- source of the name shown — see author_name.
  customer_id UUID NULL,

  -- Who said it, as the shop wants it printed. "Meera K.", "A customer
  -- from Erode". Not an email, not a handle.
  author_name VARCHAR(120) NOT NULL,

  -- SMALLINT, not INTEGER: it holds one to five and will never hold
  -- anything else. The CHECK is the part that matters — a rating of 0
  -- or 7 renders as a broken row of stars on every screen that reads
  -- it, and the only place to stop that reliably is here.
  rating SMALLINT NOT NULL
    CHECK (rating BETWEEN 1 AND 5),

  -- Both optional. A rating on its own is a perfectly good review, and
  -- forcing prose to accompany a five-star phone call would mean the
  -- shop inventing it.
  title VARCHAR(150) NULL,

  body TEXT NULL,

  -- Off takes a review off the storefront without destroying it. The
  -- alternative — deleting to hide — loses the record of what was said
  -- and cannot be undone by the person who clicked it.
  published BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CASCADE, like wishlist_items and unlike order_items. An order line
  -- is evidence that a sale happened and must outlive the product; a
  -- review of a product the shop no longer stocks is a card pointing at
  -- nothing.
  CONSTRAINT fk_reviews_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- SET NULL, because the review is the shop's to publish, not the
  -- account's. Closing an account should not retract a quote the shop
  -- put on a product page; it should only break the link back.
  CONSTRAINT fk_reviews_customer
    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

-- "This product's reviews, newest first" — what the admin screen reads
-- when a product is picked, and what the storefront will read when
-- F-06.08 lands.
CREATE INDEX IF NOT EXISTS idx_reviews_product_created
  ON reviews (product_id, created_at DESC);

-- The storefront's read: published only, per product. A partial index,
-- so it stays small — the rows it excludes are the ones no shopper will
-- ever ask for.
CREATE INDEX IF NOT EXISTS idx_reviews_product_published
  ON reviews (product_id, created_at DESC)
  WHERE published;

-- The admin list with no product filter, which opens on "everything,
-- newest first".
CREATE INDEX IF NOT EXISTS idx_reviews_created
  ON reviews (created_at DESC);
