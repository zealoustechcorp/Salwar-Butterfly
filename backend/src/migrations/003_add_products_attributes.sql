-- src/migrations/003_add_products_attributes.sql
--
-- Free-form product attributes: fabric, work, sleeve, and whatever else
-- the catalogue turns out to need.
--
-- One JSONB column rather than a column per attribute, and rather than
-- an attribute table: the set of interesting attributes differs by
-- category (a saree has no sleeve) and grows over time, so a fixed
-- schema would mean a migration per idea. `categories.fits` already
-- stores its size charts this way.
--
-- Shape: {"fabric": "Cotton", "work": "Zari", "sleeve": "Half"}
-- Missing keys simply mean "not recorded"; {} is the empty case.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The admin populates each dropdown from the distinct values already in
-- use (SELECT DISTINCT attributes->>'fabric'), so that read is worth an
-- index. GIN over the whole document also serves "which products are
-- cotton" once the storefront filters on it.
CREATE INDEX IF NOT EXISTS idx_products_attributes
  ON products USING GIN (attributes);
