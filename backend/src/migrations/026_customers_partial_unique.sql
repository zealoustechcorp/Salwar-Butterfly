-- src/migrations/026_customers_partial_unique.sql
--
-- Email and phone uniqueness the way 001_create_customers.sql meant it:
-- case-folded, and only among accounts that are still open.
--
-- What the live database actually has (checked 2026-10-14) is the table
-- that was created by hand before the migrations existed: plain
-- `UNIQUE (email)` and `UNIQUE (phone)`, named by Postgres
-- customers_email_key / customers_phone_key. 001 is recorded in
-- schema_migrations, but it was recorded while that file still held a
-- stray copy of `categories`, so its partial index was never built.
--
-- Two consequences this fixes:
--
--   * Closing an account never freed its email or phone. A shopper who
--     closed their account and came back was refused at sign-up, and a
--     shopper editing their profile onto a number a closed account once
--     used was refused too — and both surfaced as a 500, because the
--     repository only recognised the migration's constraint names. The
--     code now maps both names to a 409 (and says when a closed account
--     is the holder); this migration removes the cause.
--
--   * "Meera@x.com" and "meera@x.com" could be two accounts. The
--     validator lower-cases every address it accepts, so new rows are
--     already folded; the index makes that a guarantee rather than a
--     habit.
--
-- The index names are the ones CustomerRepository maps to
-- CUSTOMER_EMAIL_EXISTS / CUSTOMER_PHONE_EXISTS, so a unique violation
-- after this runs is still a 409 with a field map.
--
-- Not CONCURRENTLY: db:migrate wraps each file in a transaction, and the
-- table is small enough (tens of rows) that the brief lock is invisible.

-- ============================================================
-- PRE-FLIGHT
-- ============================================================
--
-- The new indexes would fail on live accounts that collide once
-- case-folded. Fail with a message that says which rule, rather than a
-- bare "could not create unique index".

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM customers
    WHERE deleted_at IS NULL
    GROUP BY LOWER(email) HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      '026: open accounts share an email once lower-cased; merge or close them first';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customers
    WHERE deleted_at IS NULL AND phone IS NOT NULL
    GROUP BY phone HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      '026: open accounts share a phone number; merge or close them first';
  END IF;
END $$;

-- ============================================================
-- DROP THE OLD RULES
-- ============================================================

-- The hand-made schema's plain UNIQUE constraints.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_key;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;

-- The migration-named ones, in case a database got 001's index (or a
-- hand-made variant under the same name) — recreated below with the
-- exact definition intended.
DROP INDEX IF EXISTS customers_email_unique;
DROP INDEX IF EXISTS customers_phone_unique;

-- ============================================================
-- THE INTENDED RULES
-- ============================================================

CREATE UNIQUE INDEX customers_email_unique
  ON customers (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX customers_phone_unique
  ON customers (phone)
  WHERE deleted_at IS NULL;

-- Lookups stay on the plain columns (findByEmail / findByPhone compare
-- `email = $1`), so the existing idx_customers_email / idx_customers_phone
-- — or 001's customers_phone_idx on a fresh database — keep serving them.
