-- src/migrations/014_create_size_charts.sql
--
-- The shop's published size charts (F-06).
--
-- Until this table the charts lived in frontend/src/lib/sizing.js as two
-- hardcoded objects. That was honest while the shop published exactly
-- two charts that had never changed, but it made the shop's own
-- measurements a deployment: a row corrected on the printed card could
-- only reach the storefront through a developer. This table is that same
-- pair of charts, seeded verbatim below, with an admin screen over it.
--
-- Shop-wide, not per category. `categories.fits` already exists and is a
-- different idea — a chart attached to one collection — and nothing
-- projects it to the storefront. The charts here are what a shopper
-- actually reads: two tables for the whole catalogue, with room for a
-- third when the shop starts cutting a fit it has no chart for.
--
-- ------------------------------------------------------------
-- WHY THE JSONB, AND WHY NOT A ROW TABLE
-- ------------------------------------------------------------
--
-- A chart is a small, whole document that is always read and written at
-- once: nobody queries "every size L across every fit". The normalised
-- alternative — size_chart_rows with a column per measurement — would
-- need a migration the first time a chart wants an inseam, and would let
-- a chart exist with its rows half-written. One JSONB array per chart
-- cannot be torn, and the shape is fixed by size_chart.policy.js at the
-- application edge rather than by a schema that cannot be widened.
--
-- ------------------------------------------------------------
-- THE COLUMN NAMES
-- ------------------------------------------------------------
--
-- `column_keys` and `measurements` are the API's `columns` and `rows`,
-- renamed on the way in. Not because either word is reserved, but
-- because a repository holding `result.rows[0].rows` is a line nobody
-- reads correctly twice. The mapper renames them back.

-- ============================================================
-- THE TABLE THAT WAS ALREADY HERE
-- ============================================================
--
-- A `size_charts` table existed in the development database before this
-- migration, created by hand and never tracked: id, name, description,
-- active, and two timestamps. One row in it — "Standard Salwar Size
-- Chart", described as being for testing products — with no
-- measurements of any kind.
--
-- It is not a previous version of this feature. `git log --all -S
-- "size_charts" -- backend/` returns nothing on any branch, so no commit
-- has ever created, read or written it; the frontend commit that added
-- the static charts (9f8f6fb) touched no backend file. Nothing has a
-- foreign key into it, and the `sizeChartId` that product.service.js
-- accepts is dropped before it reaches SQL — there is no column behind
-- it. It was a false start sitting on the name this table needs.
--
-- So it is dropped rather than adapted. Adapting it would have meant
-- carrying a chart with a name and no rows onto the storefront, which is
-- a tab that opens on an empty table.
--
-- The guard is what makes this safe to leave in the file permanently: it
-- fires only on a `size_charts` with no `fit` column, which is to say
-- only on the stub. Once this migration has run, the condition is false
-- forever and a re-run cannot touch the shop's real charts.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'size_charts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'size_charts'
      AND column_name = 'fit'
  ) THEN
    RAISE NOTICE 'Dropping the untracked size_charts stub (no fit column)';
    DROP TABLE public.size_charts;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS size_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ----------------------------------------------------------
  -- FIT
  -- ----------------------------------------------------------
  --
  -- "Normal Fit", "Slim Fit", and whatever the shop cuts next. UNIQUE
  -- because it is what the chart is chosen by — the tab a shopper picks
  -- on the storefront is this string, and two charts under one name is a
  -- tab that shows one of them for reasons nobody can see.
  --
  -- Free text rather than an enum: the whole point of this table is that
  -- adding a fit is a row, not a deployment.
  fit VARCHAR(60) NOT NULL UNIQUE,

  -- The heading over the table — "Normal fit — salwars and co-ord sets".
  -- Separate from `fit` because the tab needs two words and the heading
  -- needs to say which garments the chart covers.
  title VARCHAR(160) NOT NULL,

  -- ----------------------------------------------------------
  -- WHAT THE NUMBERS DESCRIBE
  -- ----------------------------------------------------------
  --
  -- 'body'    the shopper measures themselves and reads across
  -- 'garment' the piece laid flat; they measure themselves and then
  --           match a garment to it
  --
  -- The two published charts differ on exactly this and it changes how
  -- every number below is read, so it is a column and not a footnote.
  measures VARCHAR(10) NOT NULL DEFAULT 'body',

  -- Inches, as the shop prints them. Stored per chart so a chart sourced
  -- in centimetres does not have to be converted by hand into a table
  -- whose heading says otherwise.
  unit VARCHAR(4) NOT NULL DEFAULT 'in',

  -- ----------------------------------------------------------
  -- THE TABLE
  -- ----------------------------------------------------------
  --
  -- column_keys: ["size", "bust", "waist", "hip"]
  --   Keys, not headings. The storefront prints "Bust" for `bust` from
  --   its own label map, so the set is closed — see
  --   config/size_chart.policy.js. "size" is always the first.
  --
  -- measurements: [{"size": "XS", "bust": 34, "waist": 28, "hip": 36}, ...]
  --   One object per row, in the order the table prints. A measurement
  --   may be null where the shop states none for that size; it renders
  --   as a dash rather than a zero, which would be a measurement.
  column_keys JSONB NOT NULL,

  measurements JSONB NOT NULL,

  -- ----------------------------------------------------------
  -- ORDER AND VISIBILITY
  -- ----------------------------------------------------------
  --
  -- `position` is the order the shop prints them in, which is the order
  -- the storefront's tabs appear in. Not derived from the name or the
  -- date: the first tab is the chart most shoppers need, and only the
  -- shop knows which that is.
  position INTEGER NOT NULL DEFAULT 0,

  -- Off, rather than deleted. A fit the shop has stopped cutting still
  -- has orders behind it, and a chart taken down in April is worth
  -- having back in October.
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ----------------------------------------------------------
  -- CONSTRAINTS
  -- ----------------------------------------------------------
  --
  -- These mirror size_chart.policy.js. The module is what the API
  -- refuses on and can say why; these are what stop a value nobody
  -- defined reaching the table through psql.

  CONSTRAINT chk_size_charts_measures
    CHECK (measures IN ('body', 'garment')),

  CONSTRAINT chk_size_charts_unit
    CHECK (unit IN ('in', 'cm')),

  -- Arrays, and non-empty ones. A chart with no columns renders a table
  -- with no headings; a chart with no rows renders a heading with
  -- nothing under it, which is worse than no chart at all.
  CONSTRAINT chk_size_charts_column_keys
    CHECK (
      jsonb_typeof(column_keys) = 'array'
      AND jsonb_array_length(column_keys) BETWEEN 2 AND 9
      AND column_keys->>0 = 'size'
    ),

  CONSTRAINT chk_size_charts_measurements
    CHECK (
      jsonb_typeof(measurements) = 'array'
      AND jsonb_array_length(measurements) BETWEEN 1 AND 40
    ),

  CONSTRAINT chk_size_charts_fit
    CHECK (length(btrim(fit)) > 0),

  CONSTRAINT chk_size_charts_title
    CHECK (length(btrim(title)) > 0)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- The storefront's only read: the published charts, in print order. The
-- partial index matches it exactly, so the public endpoint never scans
-- the fits the shop has taken down.
CREATE INDEX IF NOT EXISTS idx_size_charts_published
  ON size_charts (position, fit)
  WHERE active;

-- ============================================================
-- THE TWO PUBLISHED CHARTS
-- ============================================================
--
-- Transcribed from frontend/src/lib/sizing.js, which transcribed them
-- from the cards the shop hands out. Nothing here is derived,
-- interpolated or rounded — a row that looks inconsistent with its
-- neighbours is the shop's chart, and correcting it here would be
-- inventing a measurement for a garment somebody is about to buy.
--
-- Every number is in inches.
--
-- ON CONFLICT DO NOTHING, so this migration is safe to re-run and, more
-- importantly, so re-running it never overwrites what an admin has since
-- edited. The seed establishes these two charts; from here they belong
-- to the shop.

INSERT INTO size_charts (fit, title, measures, unit, column_keys, measurements, position)
VALUES
  (
    'Normal Fit',
    'Normal fit — salwars and co-ord sets',
    'body',
    'in',
    '["size", "bust", "waist", "hip"]'::jsonb,
    -- The size labels are the shop's own and are deliberately
    -- inconsistent past XL ("XXL", then "3X", "4X", then "5XL"). Kept as
    -- printed, so a shopper comparing this against the shop's card sees
    -- the same words.
    '[
      {"size": "XS",  "bust": 34, "waist": 28, "hip": 36},
      {"size": "S",   "bust": 36, "waist": 30, "hip": 38},
      {"size": "M",   "bust": 38, "waist": 32, "hip": 40},
      {"size": "L",   "bust": 40, "waist": 34, "hip": 42},
      {"size": "XL",  "bust": 42, "waist": 36, "hip": 44},
      {"size": "XXL", "bust": 44, "waist": 38, "hip": 46},
      {"size": "3X",  "bust": 46, "waist": 40, "hip": 48},
      {"size": "4X",  "bust": 48, "waist": 42, "hip": 50},
      {"size": "5XL", "bust": 50, "waist": 44, "hip": 52}
    ]'::jsonb,
    1
  ),
  (
    'Slim Fit',
    'Slim fit — salwars',
    'garment',
    'in',
    '["size", "bust", "waist", "hip", "shoulder"]'::jsonb,
    -- The shop's chart shows one further row above S that is redacted on
    -- the copy it circulates. Omitted rather than guessed at.
    '[
      {"size": "S",   "bust": 36, "waist": 34, "hip": 39, "shoulder": 14},
      {"size": "M",   "bust": 38, "waist": 36, "hip": 41, "shoulder": 14.5},
      {"size": "L",   "bust": 40, "waist": 38, "hip": 43, "shoulder": 15},
      {"size": "XL",  "bust": 42, "waist": 40, "hip": 45, "shoulder": 15.5},
      {"size": "2XL", "bust": 44, "waist": 42, "hip": 47, "shoulder": 16},
      {"size": "3XL", "bust": 46, "waist": 44, "hip": 49, "shoulder": 16.5}
    ]'::jsonb,
    2
  )
ON CONFLICT (fit) DO NOTHING;

-- ============================================================
-- WHAT IS NOT HERE
-- ============================================================
--
-- Pant length. It does not vary by size — the shop cuts one length per
-- garment type and alters on request — so it is a property of the
-- garment and not a row in any of these tables. It stays in
-- frontend/src/lib/sizing.js as PANT_LENGTH, alongside the guidance on
-- how to read a chart, which is the shop's standing copy rather than
-- data anybody edits per fit.
