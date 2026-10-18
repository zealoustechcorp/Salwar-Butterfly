-- src/migrations/028_create_home_sections.sql
--
-- The product shelves on the home page that the shop picks by hand
-- (F-06): "Best sellers", "Diwali Sale", "Pongal Specials", "Wedding
-- Edit" and so on. Each is a title, an optional line under it, and an
-- ordered list of pieces.
--
-- The automatic shelves — "New launches", "On offer" — are not rows here.
-- They are worked out from the catalogue the home page already loads, so
-- there is nothing for the shop to maintain.
--
-- ------------------------------------------------------------
-- WHY THERE IS NO `kind` COLUMN
-- ------------------------------------------------------------
--
-- "Best sellers" and "Diwali Sale" are the same thing to the database: a
-- name and a hand-picked list. The shop decided best sellers are chosen,
-- not computed from orders, so a type column would separate two rows that
-- behave identically.
--
-- ------------------------------------------------------------
-- THE DATE WINDOW
-- ------------------------------------------------------------
--
-- `starts_at` / `ends_at` are what make a festival shelf run itself: it
-- appears on the home page when the window opens and disappears when it
-- closes, with nobody remembering to switch it. Either end may be open —
-- an evergreen shelf like "Best sellers" leaves both NULL. `active` is
-- still the switch the shop reaches for first; the window only narrows
-- when an active shelf is shown.
--
-- No discount lives here. A festival shelf groups pieces; their prices are
-- set on the products, exactly as before.

CREATE TABLE IF NOT EXISTS home_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- As printed above the shelf.
  title VARCHAR(80) NOT NULL,

  -- An optional line under the title — "Up to 30% off till 3 Nov".
  subtitle VARCHAR(200) NULL,

  -- The shelf's own page, /collections/<slug>, which "View all" opens.
  -- Lower-case words joined by hyphens, so it is safe in a URL as typed.
  slug VARCHAR(100) NOT NULL,

  starts_at TIMESTAMPTZ NULL,
  ends_at   TIMESTAMPTZ NULL,

  -- The order the shelves are stacked in. New shelves are appended; only
  -- the reorder endpoint changes this afterwards.
  position INTEGER NOT NULL DEFAULT 0,

  -- Off rather than deleted, so last year's Diwali shelf can be switched
  -- back on with its pieces still picked.
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- How the shelf is drawn on the home page:
  --   festival   a coloured band with the title, a countdown to `ends_at`
  --              when there is one, and arch-framed pieces
  --   cards      plain product cards with a Shop now button
  --   editorial  the first picked piece as a large picture beside a
  --              slider of the rest
  -- Nothing festival-specific is built into any of them; a Diwali shelf
  -- and a Pongal shelf differ only in their text, dates and theme.
  layout VARCHAR(20) NOT NULL DEFAULT 'cards',

  -- The colour set the festival band is drawn in. One of a few presets
  -- rather than a free colour, so a shelf cannot clash with the brand.
  -- Ignored by the other layouts.
  theme VARCHAR(20) NOT NULL DEFAULT 'maroon-gold',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- These mirror config/home_section.policy.js, which is what the API
  -- refuses on and explains. These stop a row nobody validated.
  CONSTRAINT chk_home_sections_title
    CHECK (length(btrim(title)) > 0),

  CONSTRAINT chk_home_sections_subtitle
    CHECK (subtitle IS NULL OR length(btrim(subtitle)) > 0),

  CONSTRAINT chk_home_sections_slug
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  CONSTRAINT chk_home_sections_window
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),

  CONSTRAINT chk_home_sections_position
    CHECK (position >= 0),

  CONSTRAINT chk_home_sections_layout
    CHECK (layout IN ('festival', 'cards', 'editorial')),

  CONSTRAINT chk_home_sections_theme
    CHECK (theme IN ('maroon-gold', 'turmeric-leaf', 'emerald', 'saffron-navy', 'ink-blush')),

  CONSTRAINT uq_home_sections_slug
    UNIQUE (slug)
);

-- The pieces on each shelf, in the order the shop picked them.
--
-- CASCADE on both sides. Deleting a shelf takes its picks with it; deleting
-- a product takes it off every shelf, since a shelf slot pointing at
-- nothing has nothing to render. A product the shop merely takes off sale
-- (`active = FALSE`) stays picked and is filtered out by the public read,
-- so it reappears in place if it comes back.
CREATE TABLE IF NOT EXISTS home_section_products (
  section_id UUID NOT NULL,
  product_id UUID NOT NULL,
  position   INTEGER NOT NULL,

  CONSTRAINT pk_home_section_products
    PRIMARY KEY (section_id, product_id),

  CONSTRAINT chk_home_section_products_position
    CHECK (position >= 0),

  CONSTRAINT fk_home_section_products_section
    FOREIGN KEY (section_id)
    REFERENCES home_sections(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_home_section_products_product
    FOREIGN KEY (product_id)
    REFERENCES products(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

-- ============================================================
-- INDEXES
-- ============================================================

-- The storefront's read: active shelves in the shop's order. The window
-- is checked per row; there are a handful of shelves, not thousands.
CREATE INDEX IF NOT EXISTS idx_home_sections_active
  ON home_sections (position ASC, created_at ASC)
  WHERE active;

-- A shelf's picks in order. The primary key leads with section_id, but not
-- by position.
CREATE INDEX IF NOT EXISTS idx_home_section_products_order
  ON home_section_products (section_id, position);

-- "Which shelves is this product on" — what makes the product-side CASCADE
-- cheap.
CREATE INDEX IF NOT EXISTS idx_home_section_products_product
  ON home_section_products (product_id);
