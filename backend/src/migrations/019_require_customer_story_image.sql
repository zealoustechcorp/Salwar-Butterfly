-- src/migrations/019_require_customer_story_image.sql
--
-- A customer story must carry a photograph (F-06.08).
--
-- 018 allowed three shapes: a picture, some words, or both. This narrows
-- that to two. A story is now a photograph, optionally with something
-- the customer said printed under it — and a quote with no picture is no
-- longer a story the shop can publish.
--
-- The reason is what the section is for. The rail on the home page is
-- built out of pictures: cards are a fixed portrait frame, and a card
-- with nothing in that frame is a box of text sitting in a row of
-- photographs, which reads as something that failed to load rather than
-- as a quote. The words are what a picture is captioned with here, not
-- an alternative to one.
--
-- What this leaves is the `body` column, still nullable, still optional.
-- That has not changed: most stories are a photograph and nothing else.
--
-- ------------------------------------------------------------
-- THE ROWS THAT CANNOT SURVIVE THIS
-- ------------------------------------------------------------
--
-- A story with no image is unrepresentable under the new rule, so the
-- DELETE below removes any. That is a destructive statement in a
-- migration, which is worth being explicit about rather than quiet:
--
--   - It can only match rows created under 018, which landed and is
--     narrowed on the same day. The feature has not shipped.
--   - The rows it matches are text a shop typed into an admin form and
--     could type again, not a photograph a customer sent that nobody
--     can ask for twice. Nothing here deletes a file from Cloudinary,
--     because these rows by definition have none.
--
-- If this migration is ever run against a database where that is not
-- true, the NOTICE below is what says how many rows went.

DO $$
DECLARE
  doomed INTEGER;
BEGIN
  SELECT COUNT(*) INTO doomed FROM customer_stories WHERE image IS NULL;

  IF doomed > 0 THEN
    RAISE NOTICE 'Deleting % customer story row(s) that carry no photograph', doomed;

    DELETE FROM customer_stories WHERE image IS NULL;
  END IF;
END $$;

-- ============================================================
-- THE CONSTRAINTS
-- ============================================================
--
-- Both of the CHECKs from 018 are dropped rather than amended, because
-- NOT NULL on the two image columns says everything they said and says
-- it in the column definition where it is read:
--
--   chk_customer_stories_content     "image IS NOT NULL OR body is
--                                    non-empty" — the left half is now
--                                    always true.
--   chk_customer_stories_image_pair  "(image IS NULL) = (image_public_id
--                                    IS NULL)" — neither may be null, so
--                                    they cannot disagree.

ALTER TABLE customer_stories
  DROP CONSTRAINT IF EXISTS chk_customer_stories_content,
  DROP CONSTRAINT IF EXISTS chk_customer_stories_image_pair;

ALTER TABLE customer_stories
  ALTER COLUMN image SET NOT NULL,
  ALTER COLUMN image_public_id SET NOT NULL;

-- The URL and Cloudinary's handle for it are still one fact, and both
-- must still be a value rather than an empty string — NOT NULL alone
-- would let '' through, which is a row that renders a broken frame and
-- can never have its file deleted.

ALTER TABLE customer_stories
  DROP CONSTRAINT IF EXISTS chk_customer_stories_image;

ALTER TABLE customer_stories
  ADD CONSTRAINT chk_customer_stories_image
    CHECK (
      length(btrim(image)) > 0
      AND length(btrim(image_public_id)) > 0
    );
