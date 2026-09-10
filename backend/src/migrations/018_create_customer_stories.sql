-- src/migrations/018_create_customer_stories.sql
--
-- What customers have sent the shop (F-06.08, home page).
--
-- The shop collects what customers say and send — a message, a photo of
-- the piece being worn — and publishes a selection of it on the home
-- page. This table is that selection.
--
-- ------------------------------------------------------------
-- WHY THIS IS NOT THE `reviews` TABLE
-- ------------------------------------------------------------
--
-- It nearly is, and the case for folding it in was strong enough to be
-- worth writing down.
--
-- `reviews` (012) is already admin-authored and already sourced the same
-- way — its own header says the shop publishes what customers say on
-- WhatsApp and on the phone. What it is not is optional about the two
-- things that matter here: `product_id` is NOT NULL and `rating` is NOT
-- NULL. A review is about a piece and scores it.
--
-- A story often is neither. A photograph of a customer at a wedding, a
-- note about how quickly a parcel arrived — these name no product and
-- carry no stars, and making `reviews.product_id` nullable to fit them
-- would weaken a constraint that the product page's whole read depends
-- on, for rows that page will never show.
--
-- So they are separate tables that happen to rhyme. A quote the shop
-- wants in both places is entered twice, and that is the cost of the
-- split; it is paid in typing rather than in a constraint.
--
-- ------------------------------------------------------------
-- WHAT A STORY IS
-- ------------------------------------------------------------
--
-- A picture, or some words, or both — and a name only when the shop has
-- one to print. `customer_name` is nullable because the ordinary case is
-- an image with nothing typed against it at all: the shop drops a set of
-- photographs in, and fills in a name on the few that have one.
--
-- There is no `type` column saying which of the three a row is. It is
-- already implied by which of `image` and `body` are present, and a
-- fourth state — a type that disagrees with the columns — is a state
-- worth not being able to reach.

CREATE TABLE IF NOT EXISTS customer_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ----------------------------------------------------------
  -- WHO
  -- ----------------------------------------------------------
  --
  -- As the shop wants it printed — "Meera K.", "A customer from Erode".
  -- Not an email and not a handle.
  --
  -- Nullable, unlike reviews.author_name, and that is the difference the
  -- admin screen is built around: a story with no name renders as the
  -- photograph alone rather than as a quote from nobody. There is no
  -- "Anonymous" fallback anywhere downstream.
  --
  -- A plain string rather than a join, for the reason 012 gives at
  -- length: the person may have no account, and where they do, their
  -- display name is still a snapshot that must not silently rewrite
  -- something published months ago.
  customer_name VARCHAR(120) NULL,

  -- ----------------------------------------------------------
  -- WHAT
  -- ----------------------------------------------------------

  -- What they said, as the shop chooses to print it.
  body TEXT NULL,

  -- What they sent. `image_public_id` is Cloudinary's handle for the
  -- file and the only argument its destroy call accepts — see
  -- 017_create_banners.sql for why it is stored rather than parsed back
  -- out of the URL.
  image VARCHAR(500) NULL,

  image_public_id VARCHAR(255) NULL,

  -- ----------------------------------------------------------
  -- WHICH PIECE
  -- ----------------------------------------------------------
  --
  -- Optional. Where it is set, the card on the home page is a link
  -- through to that product; where it is not, the card is not clickable.
  --
  -- ON DELETE SET NULL, and deliberately not the CASCADE that
  -- reviews.product_id uses. A review of a product the shop no longer
  -- stocks is a card pointing at nothing, so it goes with the product. A
  -- story is the customer's, not the product's — delisting a piece
  -- should stop the card linking anywhere, not retract what somebody
  -- said about their order.
  product_id UUID NULL,

  -- ----------------------------------------------------------
  -- ORDER AND VISIBILITY
  -- ----------------------------------------------------------
  --
  -- `position` is the order the cards are shown in. Never sent by the
  -- admin screen: new stories are inserted at the *front*, and the only
  -- thing that changes this column afterwards is the reorder endpoint.
  --
  -- At the front rather than appended, which is the opposite of a banner
  -- and for a reason. A carousel is a sequence the shop composes and an
  -- upload should not push in front of the slide it chose to open on;
  -- stories accumulate over months, and the fresh ones are the ones
  -- worth showing.
  position INTEGER NOT NULL DEFAULT 0,

  -- Off, rather than deleted. Taking a story down should not destroy the
  -- photograph a customer sent, and a shop that has to delete in order
  -- to hide will eventually delete something it wanted back.
  published BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ----------------------------------------------------------
  -- CONSTRAINTS
  -- ----------------------------------------------------------
  --
  -- These mirror config/customer_story.policy.js, which is what the API
  -- refuses on and can say why. These are what stop a row nobody
  -- validated reaching the table through psql.

  -- A story is a picture, or some words, or both — never neither. This
  -- is the constraint that replaces a `type` column: it is what makes
  -- "which kind of story is this" answerable from the row itself.
  CONSTRAINT chk_customer_stories_content
    CHECK (
      image IS NOT NULL
      OR length(btrim(COALESCE(body, ''))) > 0
    ),

  -- The two image columns are one fact. A row holding a URL with no
  -- public id is a file that can never be deleted; a row holding a
  -- public id with no URL is a file nobody can see.
  CONSTRAINT chk_customer_stories_image_pair
    CHECK ((image IS NULL) = (image_public_id IS NULL)),

  -- A name is either absent or is a name. An empty string would print as
  -- a byline with nothing in it.
  CONSTRAINT chk_customer_stories_name
    CHECK (customer_name IS NULL OR length(btrim(customer_name)) > 0),

  CONSTRAINT chk_customer_stories_position
    CHECK (position >= 0),

  -- One row per Cloudinary file, for the reason banners gives: two rows
  -- pointing at one file means deleting either breaks the other.
  CONSTRAINT uq_customer_stories_image_public_id
    UNIQUE (image_public_id),

  CONSTRAINT fk_customer_stories_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================

-- The storefront's only read: the published stories, in the order the
-- shop chose. A partial index, so the public endpoint never scans the
-- ones taken down.
CREATE INDEX IF NOT EXISTS idx_customer_stories_published
  ON customer_stories (position ASC, created_at DESC)
  WHERE published;

-- "Which stories point at this piece" — what the admin screen reads when
-- a product is being deleted, and what makes the SET NULL above cheap.
CREATE INDEX IF NOT EXISTS idx_customer_stories_product
  ON customer_stories (product_id)
  WHERE product_id IS NOT NULL;
