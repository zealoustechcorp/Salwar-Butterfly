-- src/migrations/015_add_variant_colours.sql
--
-- Colour, arriving exactly where 004 said it would: another column on
-- product_variants, with the unique constraint widening from
-- (product_id, size) to (product_id, size, colour).
--
-- The sellable unit becomes the (size, colour) pair. That is the whole
-- point — "Maroon M sold out, Teal M has 12 left" is not expressible in
-- a table keyed by size alone, and a shop that sells the same kurta in
-- three colourways has three different things to count.
--
-- ============================================================
-- WHY NOT NULL DEFAULT '' RATHER THAN NULLABLE
-- ============================================================
--
-- Not every product is sold by colour, and every variant written before
-- today has no colour at all, so the column has to have an "unspecified"
-- state. It is the empty string rather than NULL for one reason: NULLs
-- are distinct from each other in a UNIQUE constraint, so a nullable
-- column would let (product, "M", NULL) be inserted twice and the
-- constraint would not object — which is the duplicate the constraint
-- exists to prevent, in the exact case that describes most of the
-- catalogue today.
--
-- Postgres 15's NULLS NOT DISTINCT would also solve it, but it pins the
-- schema to a server version for no gain here. '' is the sentinel; the
-- mapper presents it to clients as null, so the API surface never has to
-- know.

-- ============================================================
-- THE COLUMN
-- ============================================================

-- The colour's display name — "Maroon", "Rani Pink". Free text at the
-- database level, but the admin chooses it from the approved-values
-- register (006) rather than typing it, which is what stops "Maroon",
-- "maroon " and "Marron" from becoming three colourways.
--
-- The name is stored rather than a foreign key to the register, for the
-- same reason products.attributes stores "Cotton" and not a fabric id:
-- the register curates what may be chosen, it does not own what was
-- already chosen. Renaming a registered colour rewrites the variants
-- carrying it, in one transaction, the way renaming a fabric already
-- rewrites the products carrying it.
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS colour VARCHAR(40) NOT NULL DEFAULT '';

-- ============================================================
-- THE KEY WIDENS
-- ============================================================
--
-- Wrapped in DO blocks because ALTER TABLE ... ADD CONSTRAINT has no
-- IF NOT EXISTS, and every migration in this project has to survive being
-- run against a database that was set up by hand.

ALTER TABLE product_variants
  DROP CONSTRAINT IF EXISTS uq_product_variants_product_size;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_product_variants_product_size_colour'
  ) THEN
    -- A product cannot list the same size twice in the same colour.
    -- It may list "M" in Maroon and "M" in Teal, which is the change.
    ALTER TABLE product_variants
      ADD CONSTRAINT uq_product_variants_product_size_colour
      UNIQUE (product_id, size, colour);
  END IF;
END $$;

-- "What colours does this product come in?" — asked by the product form
-- and, once the storefront catches up, by every product page.
CREATE INDEX IF NOT EXISTS idx_product_variants_product_colour
  ON product_variants (product_id, colour);

-- ============================================================
-- THE REGISTER LEARNS ABOUT HEX
-- ============================================================
--
-- A colour has to be shown as a colour. A row reading "Maroon" next to a
-- row reading "Rani Pink" tells an admin scanning a stock table far less
-- than two swatches do, and the storefront cannot draw a swatch picker
-- out of a name.
--
-- Nullable, and on the register generally rather than a colour-only
-- table: fabric and work rows simply leave it empty. A registered colour
-- without a hex still works — it renders as a name chip — so the column
-- being unset is a display fallback, never a broken row.
ALTER TABLE product_attribute_values
  ADD COLUMN IF NOT EXISTS hex CHAR(7) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_product_attribute_values_hex'
  ) THEN
    -- Six digits with the hash, always. Storing '#abc' shorthand or a
    -- bare 'abc' would mean every reader had to normalise before it could
    -- render, and one of them eventually would not.
    ALTER TABLE product_attribute_values
      ADD CONSTRAINT ck_product_attribute_values_hex
      CHECK (hex IS NULL OR hex ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;
