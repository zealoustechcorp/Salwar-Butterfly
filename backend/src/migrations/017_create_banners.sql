-- src/migrations/017_create_banners.sql
--
-- The home page carousel (F-06).
--
-- Until this table the banner set lived in frontend/src/lib/store/shop.js
-- as a frozen array of five Cloudinary URLs. That file argues, at some
-- length, that the shop's own identity does not belong in a database: a
-- logo and a WhatsApp number change a handful of times in a shop's life,
-- and building CRUD for them is more surface than the thing it manages.
--
-- That argument holds for the logo and it does not hold for the banners,
-- which is why these move and the rest of that file stays where it is. A
-- banner set is seasonal — a festival run, a new drop, a sale that ends
-- on Sunday — and the shop changes it on its own schedule rather than on
-- a developer's. Everything else in SHOP is still a commit.
--
-- ------------------------------------------------------------
-- WHAT A BANNER IS NOT
-- ------------------------------------------------------------
--
-- There is no title, no subtitle, no call to action and no link. The
-- carousel in Hero.js renders each slide as a photograph with alt="" —
-- decorative, beside a headline that already sits next to it — and the
-- shop composes whatever it wants said into the artwork itself. Adding a
-- caption column because a banner table usually has one would put a
-- second headline on a fold that already has one.
--
-- A slide is an image and a place in the order. That is the whole model,
-- and it is the model the shop asked for.
--
-- ------------------------------------------------------------
-- THE TWO IMAGE COLUMNS
-- ------------------------------------------------------------
--
-- `image` is what the browser loads. `image_public_id` is what
-- Cloudinary's destroy and replace calls accept, and they accept nothing
-- else — see config/cloudinary.cdn.js. Without the second column,
-- deleting a banner would drop the row and leave the file on Cloudinary
-- with nothing left pointing at it to find it by.
--
-- Parsing the id back out of the URL is possible and wrong: the moment a
-- transformation appears in the path, the parse yields an id that does
-- not exist, and destroy() answers "not found" rather than failing. The
-- orphans would be silent. `categories` (001) and `product_images` (007)
-- both carry the pair for the same reason.

CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The secure_url Cloudinary hands back. 500 matches categories.image.
  image VARCHAR(500) NOT NULL,

  -- Cloudinary's own handle for that file. Not derived from the URL —
  -- see the note above.
  image_public_id VARCHAR(255) NOT NULL,

  -- ----------------------------------------------------------
  -- ORDER AND VISIBILITY
  -- ----------------------------------------------------------
  --
  -- `position` is the order the slides rotate in. Never sent by the
  -- admin screen: a new banner is appended after everything the shop is
  -- already showing, and the only thing that changes this column is the
  -- reorder endpoint, which rewrites the whole set at once.
  --
  -- Appended rather than prepended, unlike a customer story. A carousel
  -- is a sequence the shop composes, and an upload should not push
  -- itself in front of the slide the shop chose to open on.
  position INTEGER NOT NULL DEFAULT 0,

  -- Off, rather than deleted. A Diwali banner taken down in November is
  -- worth having back next October, and deleting to hide destroys the
  -- Cloudinary file along with the row.
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ----------------------------------------------------------
  -- CONSTRAINTS
  -- ----------------------------------------------------------
  --
  -- These mirror config/banner.policy.js, which is what the API refuses
  -- on and can say why. These are what stop a row nobody validated
  -- reaching the table through psql.

  CONSTRAINT chk_banners_image
    CHECK (length(btrim(image)) > 0),

  CONSTRAINT chk_banners_image_public_id
    CHECK (length(btrim(image_public_id)) > 0),

  CONSTRAINT chk_banners_position
    CHECK (position >= 0),

  -- One row per Cloudinary file. Uploading the same artwork twice is a
  -- new file with a new id and is allowed; two rows pointing at one file
  -- are not, because deleting either would break the other.
  CONSTRAINT uq_banners_image_public_id
    UNIQUE (image_public_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- The storefront's only read: the live slides, in rotation order. A
-- partial index, so the public endpoint never scans the banners the shop
-- has taken down.
CREATE INDEX IF NOT EXISTS idx_banners_active
  ON banners (position ASC, created_at ASC)
  WHERE active;

-- ============================================================
-- THE FIVE BANNERS THE SHOP IS ALREADY SHOWING
-- ============================================================
--
-- Transcribed from SHOP.banners in frontend/src/lib/store/shop.js, in
-- the order that array had them.
--
-- This seed is not a convenience. The commit that adds this table also
-- takes `banners` out of that file and points Hero.js at the API, so
-- without these rows the home page's first fold would fall back to the
-- illustrated GarmentArt lockup the moment this deploys — the shop's
-- real photography replaced by drawings, with nothing to say why.
--
-- Each `image_public_id` is the path segment between `/upload/v<n>/` and
-- the extension, which is what Cloudinary stored these under. They live
-- in `shop/settings` rather than the `banners` folder new uploads go to;
-- that is where they already are, and moving files on Cloudinary to tidy
-- a folder name would break every URL in this table.
--
-- Guarded on the table being empty rather than ON CONFLICT: the point is
-- to establish the starting set exactly once. Re-running this migration
-- against a shop that has since curated its own carousel must not push
-- five retired banners back onto the home page, and a per-row conflict
-- clause would do exactly that for any the shop had deleted.

INSERT INTO banners (image, image_public_id, position)
SELECT * FROM (
  VALUES
    ('https://res.cloudinary.com/ddvui6pi4/image/upload/v1781193886/shop/settings/mfdylo1mwpnsmykcw0ag.jpg',
     'shop/settings/mfdylo1mwpnsmykcw0ag', 1),
    ('https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149601/shop/settings/hjmgv0ldthb9vn99hlh9.jpg',
     'shop/settings/hjmgv0ldthb9vn99hlh9', 2),
    ('https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149742/shop/settings/d8fuqoctx9wkxvgqlh5v.jpg',
     'shop/settings/d8fuqoctx9wkxvgqlh5v', 3),
    ('https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149652/shop/settings/oktrkjeec6erzhocqdjg.jpg',
     'shop/settings/oktrkjeec6erzhocqdjg', 4),
    ('https://res.cloudinary.com/ddvui6pi4/image/upload/v1782149768/shop/settings/ymablyxlrytu1povjvm2.jpg',
     'shop/settings/ymablyxlrytu1povjvm2', 5)
) AS seed(image, image_public_id, position)
WHERE NOT EXISTS (SELECT 1 FROM banners);
