-- src/migrations/026_customers_timestamptz.sql
--
-- customers.created_at / updated_at / deleted_at to TIMESTAMPTZ, as
-- 001_create_customers.sql declares them.
--
-- On the live database they are `timestamp WITHOUT time zone` (the table
-- predates the migrations). Every other table's timestamps are
-- timestamptz, and the naive columns were quietly wrong in the API:
-- node-pg parses a naive timestamp as the *host's* local time, and the
-- API host runs in IST (Asia/Kolkata), so every customer date came back
-- 5h30m earlier than the moment it records.
--
-- ============================================================
-- WHICH ZONE THE STORED VALUES ARE IN
-- ============================================================
--
-- Checked read-only on 2026-10-14: `SHOW TimeZone` on the application's
-- pool connections returns GMT, and neither the role (avnadmin) nor the
-- database (salwar_butterfly) overrides it. Every write to these
-- columns comes from the column default `now()` or from `NOW()` in
-- CustomerRepository / PasswordResetRepository — never from a JS Date —
-- and a timestamptz assigned to a naive column is rendered in the
-- session TimeZone. So the stored wall-clock values are UTC, and
-- `AT TIME ZONE 'UTC'` reads them back as the instants they were.
--
-- Evidence it is not IST: LOCALTIMESTAMP on that connection reads
-- 22:46 when NOW() is 04:16Z — five and a half hours behind the API
-- host's own clock, which is the shift the storefront was showing.
--
-- If this database was ever written under a different session TimeZone
-- (someone running hand-made inserts from a psql set to IST, say), those
-- rows will be off by the difference after this runs. There is no way to
-- tell them apart from inside the table.
--
-- ============================================================
-- CODE
-- ============================================================
--
-- CustomerRepository already selects these as `col::timestamptz`, which
-- interprets a naive value in the session TimeZone (GMT) and is a no-op
-- on a timestamptz column — so the API reports the right instant before
-- and after this migration, and the casts can stay.
--
-- The ALTER rewrites the table and rebuilds its indexes; at tens of rows
-- that is a moment's lock.

ALTER TABLE customers
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

-- The defaults were already now(); restated so a database whose default
-- was something naive (LOCALTIMESTAMP, now()::timestamp) ends up right.
ALTER TABLE customers
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();
