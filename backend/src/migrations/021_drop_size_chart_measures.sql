-- src/migrations/021_drop_size_chart_measures.sql
--
-- A size chart no longer says whether its numbers are a body or a
-- garment (F-06).
--
-- 014 made this a column because the two seeded charts differed on it:
-- the normal fit was transcribed from a body card and the slim fit from
-- a garment card, and the storefront printed a line above each table
-- saying which. The shop has decided that distinction is not worth the
-- question the admin editor had to ask to keep it — every chart it
-- publishes from here is read the same way, against the shopper, and a
-- required dropdown on the new-chart form was one more thing to get
-- wrong for a difference nobody outside this repository asked for.
--
-- So the column goes, rather than being left behind defaulted to 'body'
-- with nothing able to write it. A column no code reads and no screen
-- sets is a column that will be believed by the next person to read the
-- schema.
--
-- ------------------------------------------------------------
-- WHAT IS LOST
-- ------------------------------------------------------------
--
-- The seeded 'Slim Fit' chart is the only row that can hold 'garment',
-- and its storefront note goes with this. The measurements themselves
-- are untouched — every number in `measurements` stays exactly as the
-- shop typed it. What stops being printed is the sentence above the
-- table explaining how to read them.
--
-- There is no undo. Restoring the distinction means a new column and
-- somebody deciding, chart by chart, which kind each one is; the old
-- values are not recoverable from what is left here.

-- The CHECK first: it names the column, so dropping the column would
-- take it anyway, but saying so is how this file stays readable next to
-- the constraint block in 014.

ALTER TABLE size_charts
  DROP CONSTRAINT IF EXISTS chk_size_charts_measures;

ALTER TABLE size_charts
  DROP COLUMN IF EXISTS measures;
