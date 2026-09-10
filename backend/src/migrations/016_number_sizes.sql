-- src/migrations/016_number_sizes.sql
--
-- The shop sizes by the number, not the letter: 38, 40, 42 rather than
-- M, L, XL.
--
-- The number is the bust in inches, which the shop's own Normal Fit
-- chart has printed against every row since 014 — so this is a renaming
-- of what was already there rather than a new sizing system. The letter
-- a row carried and the number it carries now describe the same garment,
-- measured the same way, off the same card:
--
--   XS 34   S 36   M 38   L 40   XL 42
--   XXL 44  3X 46  4X 48  5XL 50
--
-- Two tables hold size labels and both are renamed here, because they
-- have to agree. A shopper who picks "40" on a product and then opens
-- the size chart has to find a "40" row in it; leaving the charts on
-- letters would make every chart a translation exercise, which is the
-- thing numbering the sizes was meant to end.
--
-- ============================================================
-- WHAT THIS DOES NOT TOUCH
-- ============================================================
--
-- Sizes that are not on the ladder. "Free Size", "Free", a numeric size
-- already, and anything else the shop has typed into the custom-size
-- field stay exactly as they are: this migration only knows what the
-- eight letter labels above mean, and a label it does not recognise is
-- one it must not guess at.
--
-- Order history. `order_items` keeps its own copy of what was bought, so
-- an order placed in "M" still reads "M" on the invoice it was placed
-- against. That is correct — it is what the shopper chose on the day,
-- and rewriting it would be editing a receipt.
--
-- Both statements are idempotent: a second run finds no letter labels
-- left to rename and changes nothing.

-- ============================================================
-- THE LADDER
-- ============================================================
--
-- Written twice, once per statement, because a CTE cannot outlive its
-- own statement. The catalogue writes the big sizes both ways — "XXL"
-- on some rows and "2XL" on others — and they are one size on the rack,
-- so both spellings map to the same number.

-- ============================================================
-- THE PUBLISHED CHARTS
-- ============================================================
--
-- Every chart, not only the two seeded ones: a fit the shop has added
-- since is still a chart a shopper reads their size off. Rows are
-- rebuilt in place with WITH ORDINALITY, so the print order of a chart
-- survives the rename — a chart re-ordered smallest-first would be a
-- different chart.

WITH ladder(letter, number) AS (
  VALUES
    ('XS', '34'), ('XXS', '32'),
    ('S', '36'),
    ('M', '38'),
    ('L', '40'),
    ('XL', '42'),
    ('XXL', '44'), ('2XL', '44'), ('2X', '44'),
    ('XXXL', '46'), ('3XL', '46'), ('3X', '46'),
    ('XXXXL', '48'), ('4XL', '48'), ('4X', '48'),
    ('5XL', '50'), ('5X', '50')
),
renumbered AS (
  SELECT
    c.id,
    jsonb_agg(
      CASE
        WHEN ladder.number IS NULL THEN row_value
        ELSE jsonb_set(row_value, '{size}', to_jsonb(ladder.number))
      END
      ORDER BY ord
    ) AS measurements
  FROM size_charts c
  CROSS JOIN LATERAL jsonb_array_elements(c.measurements) WITH ORDINALITY AS r(row_value, ord)
  LEFT JOIN ladder ON ladder.letter = upper(btrim(row_value->>'size'))
  GROUP BY c.id
)
UPDATE size_charts c
SET measurements = renumbered.measurements,
    updated_at = NOW()
FROM renumbered
WHERE c.id = renumbered.id
  AND c.measurements IS DISTINCT FROM renumbered.measurements;

-- ============================================================
-- THE SELLABLE ROWS
-- ============================================================
--
-- The stock rows themselves, so a product entered as S/M/L before today
-- is offered as 36/38/40 from now on. The row keeps its id, its stock
-- count, its position and its colour — only the label changes — so
-- nothing in a bag, a wishlist or an inventory report is orphaned by it.
--
-- The NOT EXISTS guard is for the product that already carries both
-- spellings: a kurta stocked in "L" and in "40" is two rows that
-- (product_id, size, colour) keeps apart, and renaming the first onto
-- the second would collide with the unique constraint and take the whole
-- migration down with it. Those rows are left on their letters instead,
-- to be merged by hand — the two counts are two separate numbers and
-- only the shop knows whether they are the same garment counted twice or
-- two runs that were never the same size.

WITH ladder(letter, number) AS (
  VALUES
    ('XS', '34'), ('XXS', '32'),
    ('S', '36'),
    ('M', '38'),
    ('L', '40'),
    ('XL', '42'),
    ('XXL', '44'), ('2XL', '44'), ('2X', '44'),
    ('XXXL', '46'), ('3XL', '46'), ('3X', '46'),
    ('XXXXL', '48'), ('4XL', '48'), ('4X', '48'),
    ('5XL', '50'), ('5X', '50')
),
renamed AS (
  SELECT v.id, ladder.number
  FROM product_variants v
  JOIN ladder ON ladder.letter = upper(btrim(v.size))
  WHERE NOT EXISTS (
    SELECT 1
    FROM product_variants other
    WHERE other.product_id = v.product_id
      AND other.colour = v.colour
      AND other.id <> v.id
      AND btrim(other.size) = ladder.number
  )
)
UPDATE product_variants v
SET size = renamed.number,
    updated_at = NOW()
FROM renamed
WHERE v.id = renamed.id;
