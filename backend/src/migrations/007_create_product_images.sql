-- src/migrations/007_create_product_images.sql
--
-- A product's photographs.
--
-- One row per image rather than a column on `products`, because a
-- garment is sold on its gallery: front, back, drape, fabric close-up.
-- `categories.image` is a single cover shot and can stay a column; a
-- product needs an ordered set, and an ordered set with a variable
-- length is a table.
--
-- There is no `is_primary` flag. The primary image is simply the one at
-- the lowest position, so "make this the cover" is the same operation as
-- "move this first" and the two can never disagree. Reordering is what
-- the gallery editor writes.

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  product_id UUID NOT NULL,

  -- The Cloudinary secure URL that the storefront renders.
  image_url TEXT NOT NULL,

  -- The Cloudinary handle. Without it a deleted row leaks its asset:
  -- the bytes stay on the account with nothing left pointing at them.
  image_public_id TEXT NOT NULL,

  -- Screen-reader text. Null means "fall back to the product name",
  -- which is what the mapper does, rather than shipping an empty alt.
  alt_text VARCHAR(200) NULL,

  -- Display order within the product. Position 0 is the cover.
  position INTEGER NOT NULL DEFAULT 0
    CHECK (position >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_product_images_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- One row per Cloudinary asset. Guards against a retried upload
  -- registering the same asset twice.
  CONSTRAINT uq_product_images_public_id
    UNIQUE (image_public_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Every read is "this product's gallery, in order".
CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON product_images (product_id, position);
