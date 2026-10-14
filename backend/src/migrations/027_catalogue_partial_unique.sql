-- src/migrations/027_catalogue_partial_unique.sql
--
-- Brings a database built from the migrations into line with the live
-- one on how catalogue names are kept unique. NOT YET APPLIED anywhere —
-- written alongside the service changes, to be run deliberately.
--
-- 1. categories.slug
--
--    001 declares `slug ... UNIQUE`, so on a fresh database a deleted
--    category keeps its slug forever. The live database instead has
--    `categories_slug_unique ON categories (slug) WHERE deleted_at IS NULL`,
--    which is what CategoryRepository.checkSlugExists (deleted rows
--    ignored) assumes. The plain constraint is dropped and the partial
--    index created, so both schemas agree with the code. The service
--    still words a clash with a deleted category correctly on a database
--    that has not run this (CategoryService uniqueViolation).
--
--    categories.name: 001 also declares it UNIQUE; the live database has
--    no such rule. It is dropped here so the two match — the service maps
--    a name clash to {name: ...} on either schema, so keeping it would
--    also be safe, but two schemas that disagree are what hid these bugs.
--
-- 2. product_attribute_values (group_name, lower(value))
--
--    The existing key is case-sensitive, so "Silk" and "silk" could both
--    be registered. The service now refuses that (findCaseInsensitiveMatch);
--    this index is the database-side backstop. Created only when no such
--    pair already exists — the live database had one (fabric / silk) when
--    this was written, and CREATE UNIQUE INDEX would fail the whole file
--    on it. Merge the pair first (rename one onto the other in the admin
--    screen, then delete it) and re-run; the NOTICE says which.
--
-- Idempotent: every step checks before it acts.

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique
  ON categories (slug)
  WHERE deleted_at IS NULL;

DO $$
DECLARE
  dupes TEXT;
BEGIN
  SELECT string_agg(format('%s/%s', group_name, lower(value)), ', ')
    INTO dupes
    FROM (
      SELECT group_name, lower(value) AS value
        FROM product_attribute_values
       GROUP BY group_name, lower(value)
      HAVING COUNT(*) > 1
    ) d;

  IF dupes IS NOT NULL THEN
    RAISE NOTICE 'uq_product_attribute_values_group_lower_value not created: case-duplicate values exist (%)', dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_product_attribute_values_group_lower_value
      ON product_attribute_values (group_name, lower(value));
  END IF;
END
$$;
