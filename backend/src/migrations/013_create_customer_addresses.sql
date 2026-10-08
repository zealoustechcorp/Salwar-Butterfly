-- src/migrations/013_create_customer_addresses.sql
--
-- A shopper's saved delivery addresses (F-05.03, F-08.05).
--
-- Until this table, an address existed only on an order. That is right
-- for the order — 008 keeps a snapshot on purpose, because an order is a
-- record of where a parcel was actually sent and must not change when
-- the shopper later moves house. But it left checkout with nothing to
-- offer a returning customer, who had to retype the same six lines every
-- time they bought something.
--
-- So: two copies, deliberately. This table is the address book, the one
-- the shopper edits. `orders.shipping_*` stays the frozen snapshot taken
-- at the moment of sale. Nothing joins one to the other — an order does
-- not point at the address row it was filled from, because that pointer
-- would go stale the first time the row was edited and dangling the
-- first time it was deleted, and neither failure has anything to offer
-- the shop.
--
-- The columns mirror `orders.shipping_*` exactly, names and widths both.
-- Checkout copies one into the other field for field, and a mismatch
-- between the two shapes would be a truncated address on a parcel.

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE: an address book has no meaning without the account. Unlike
  -- an order, nothing here is evidence of anything — a closed account's
  -- delivery addresses are just personal data the shop no longer has a
  -- reason to hold.
  customer_id UUID NOT NULL,

  -- ----------------------------------------------------------
  -- LABEL
  -- ----------------------------------------------------------
  --
  -- "Home", "Amma's place", "Office". Optional, and free text rather
  -- than an enum of the three the shop first thinks of.
  --
  -- Its job is telling three addresses apart in a picker. Without it the
  -- shopper chooses between three blocks of similar-looking text at the
  -- one moment they are least willing to read carefully.
  label VARCHAR(40) NULL,

  -- ----------------------------------------------------------
  -- ADDRESS
  -- ----------------------------------------------------------
  --
  -- Flat columns, same reasoning as 008: the shop searches by city and
  -- pincode, and this shape is not going to grow.

  line1 VARCHAR(255) NOT NULL,

  line2 VARCHAR(255) NULL,

  landmark VARCHAR(255) NULL,

  city VARCHAR(120) NOT NULL,

  state VARCHAR(120) NOT NULL,

  -- Text, not an integer — an identifier is never arithmetic, and an
  -- integer eats a leading zero.
  postal_code VARCHAR(12) NOT NULL,

  country VARCHAR(80) NOT NULL DEFAULT 'India',

  -- ----------------------------------------------------------
  -- DEFAULT
  -- ----------------------------------------------------------
  --
  -- The one checkout preselects. At most one per customer, enforced by
  -- the partial unique index below rather than by the service remembering
  -- to clear the old one — two defaults is a state the shopper cannot
  -- see and cannot fix, and the database is the only place that can
  -- actually rule it out.
  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_customer_addresses_customer
    FOREIGN KEY (customer_id)
    REFERENCES customers(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  -- Six digits, not starting at zero — the Indian PIN format, the same
  -- rule the order validator applies. Checked here too because this
  -- table is written by more than one path and a pincode that reaches
  -- the courier wrong is a parcel lost for three weeks.
  CONSTRAINT chk_customer_addresses_postal_code
    CHECK (postal_code ~ '^[1-9][0-9]{5}$')
);

-- ============================================================
-- INDEXES
-- ============================================================

-- "My addresses", default first then oldest — the only read the
-- storefront makes, and the order the picker renders in.
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON customer_addresses (customer_id, is_default DESC, created_at);

-- One default per customer. Partial, so the many FALSE rows do not
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_one_default
  ON customer_addresses (customer_id)
  WHERE is_default;

-- ============================================================
-- THE THREE-ADDRESS CAP (F-08.05)
-- ============================================================
--
-- Not enforced here. A row count per customer is not something a CHECK
-- can see, and the alternatives — a trigger, or a materialised counter
-- on `customers` — buy an invariant the shop does not need at that
-- price. The cap lives in CustomerAddressService.create, where it can
-- also say something useful to the shopper about which one to remove.
--
-- The consequence, stated so nobody has to discover it: a direct INSERT
-- outside the service can exceed three. Nothing outside the service
-- writes this table.
