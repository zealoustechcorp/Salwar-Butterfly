-- src/migrations/025_add_order_item_colour.sql
--
-- The colour an order line was bought in.
--
-- The storefront now lets a shopper pick a colourway, and checkout already
-- reserves against the exact (size, colour) variant row. What was missing
-- is the record of it: `order_items` keeps its own copy of the size so an
-- invoice survives the variant being renamed or deleted, and the colour
-- needs the same treatment for the same reason — "40 in Maroon" is what
-- the shopper paid for, and the packer has to read it off the order, not
-- off a variant row that may have changed since.
--
-- '' rather than NULL for "not sold by colour", matching
-- product_variants.colour (015), so the two columns compare without a
-- COALESCE on either side. Every line written before this migration gets
-- '' — none of them was chosen by colour, because the storefront offered
-- no choice.
--
-- Idempotent: a second run finds the column and changes nothing.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS colour VARCHAR(40) NOT NULL DEFAULT '';
