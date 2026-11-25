-- =============================================================================
-- 001_baseline.sql — MariaDB 11.8 baseline schema
--
-- Generated from the live Neon (PostgreSQL 18) schema as of 2026-11-25, which
-- is the result of migrations 001–040 in ../migrations. This single file
-- replaces that history for MariaDB; the Postgres files stay as the record of
-- how the schema got here.
--
-- Conversion rules (Postgres → MariaDB):
--   uuid + gen_random_uuid()  → UUID DEFAULT (UUID_v4())
--   timestamptz / timestamp   → DATETIME(6), always UTC. The app MUST set
--                               time_zone = '+00:00' on every connection and
--                               the driver MUST use timezone 'Z'.
--   now() / CURRENT_TIMESTAMP → CURRENT_TIMESTAMP(6)
--   bool                      → BOOLEAN (TINYINT(1); driver returns 0/1)
--   jsonb                     → JSON (LONGTEXT + automatic JSON_VALID check)
--   numeric(p,s)              → DECIMAL(p,s)
--   bpchar(n)                 → CHAR(n)
--   inet                      → VARCHAR(45)
--   text that is indexed      → VARCHAR(255)
--   Collation                 → utf8mb4_nopad_bin: case-sensitive, trailing
--                               spaces significant, byte order — matching
--                               Neon's C.UTF-8. (The database default,
--                               utf8mb4_unicode_ci, would make every
--                               comparison and unique key case-insensitive.)
--
-- Partial UNIQUE indexes (… WHERE deleted_at IS NULL etc.) do not exist in
-- MariaDB. Each one becomes an INVISIBLE virtual column that is NULL whenever
-- the row falls outside the Postgres WHERE clause, with a UNIQUE key on it —
-- UNIQUE ignores NULLs, so the effect is identical. INVISIBLE keeps these
-- columns out of SELECT * and out of INSERTs without a column list.
--
-- Partial NON-unique indexes become ordinary full indexes (same answers,
-- slightly larger index). Duplicate indexes left behind by the Postgres
-- migration history are collapsed into one. The GIN index on
-- products.attributes has no MariaDB equivalent and is dropped.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------

CREATE TABLE categories (
  id               UUID         NOT NULL DEFAULT (UUID_v4()),
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(255) NOT NULL,
  description      TEXT         NULL,
  image            TEXT         NULL,
  image_public_id  TEXT         NULL,
  fits             JSON         NULL,
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at       DATETIME(6)  NULL,
  created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- was: UNIQUE INDEX categories_slug_unique ON categories (slug) WHERE deleted_at IS NULL
  slug_live        VARCHAR(255) AS (IF(deleted_at IS NULL, slug, NULL)) VIRTUAL INVISIBLE,
  PRIMARY KEY (id),
  UNIQUE KEY categories_slug_unique (slug_live),
  KEY idx_categories_slug (slug),
  KEY idx_categories_name (name),
  KEY idx_categories_active (active),
  KEY idx_categories_deleted_at (deleted_at),
  KEY idx_categories_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE sub_categories (
  id           UUID         NOT NULL DEFAULT (UUID_v4()),
  name         VARCHAR(255) NOT NULL,
  category_id  UUID         NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_sub_categories_category_id (category_id),
  KEY idx_sub_categories_is_active (is_active),
  KEY idx_sub_categories_created_at (created_at),
  CONSTRAINT sub_categories_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE products (
  id                   UUID          NOT NULL DEFAULT (UUID_v4()),
  category_id          UUID          NOT NULL,
  sub_category_id      UUID          NULL,
  name                 VARCHAR(200)  NOT NULL,
  slug                 VARCHAR(255)  NOT NULL,
  description          TEXT          NULL,
  base_price           DECIMAL(10,2) NOT NULL,
  discount_percentage  DECIMAL(5,2)  NOT NULL DEFAULT 0,
  current_price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_featured          BOOLEAN       NOT NULL DEFAULT FALSE,
  active               BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  attributes           JSON          NOT NULL DEFAULT ('{}'),
  PRIMARY KEY (id),
  UNIQUE KEY products_slug_key (slug),
  KEY idx_products_category (category_id),
  KEY idx_products_sub_category (sub_category_id),
  KEY idx_products_active (active),
  KEY idx_products_featured (is_featured),
  KEY idx_products_price (current_price),
  KEY idx_products_created_at (created_at DESC),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT products_sub_category_id_fkey FOREIGN KEY (sub_category_id)
    REFERENCES sub_categories (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT products_base_price_check CHECK (base_price >= 0),
  CONSTRAINT products_current_price_check CHECK (current_price >= 0),
  CONSTRAINT products_discount_percentage_check CHECK (discount_percentage >= 0 AND discount_percentage <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE product_variants (
  id              UUID        NOT NULL DEFAULT (UUID_v4()),
  product_id      UUID        NOT NULL,
  size            VARCHAR(20) NOT NULL,
  stock_quantity  INT         NOT NULL DEFAULT 0,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `position`      INT         NOT NULL DEFAULT 0,
  colour          VARCHAR(40) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_product_size_colour (product_id, size, colour),
  KEY idx_product_variants_product (product_id),
  KEY idx_product_variants_position (product_id, `position`),
  KEY idx_product_variants_product_colour (product_id, colour),
  KEY idx_product_variants_active (active),
  KEY idx_product_variants_stock (stock_quantity),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT product_variants_stock_quantity_check CHECK (stock_quantity >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE product_images (
  id               UUID         NOT NULL DEFAULT (UUID_v4()),
  product_id       UUID         NOT NULL,
  image_url        TEXT         NOT NULL,
  image_public_id  VARCHAR(255) NOT NULL,   -- was text; VARCHAR so it can carry the UNIQUE key
  alt_text         VARCHAR(200) NULL,
  `position`       INT          NOT NULL DEFAULT 0,
  created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_images_public_id (image_public_id),
  KEY idx_product_images_product_position (product_id, `position`),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT product_images_position_check CHECK (`position` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE product_attribute_values (
  id          UUID         NOT NULL DEFAULT (UUID_v4()),
  group_name  VARCHAR(40)  NOT NULL,
  `value`     VARCHAR(100) NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  `position`  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  hex         CHAR(7)      NULL,
  -- was: UNIQUE INDEX … ON product_attribute_values (group_name, lower(value))
  value_lower VARCHAR(100) AS (LOWER(`value`)) VIRTUAL INVISIBLE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_attribute_values_group_value (group_name, `value`),
  UNIQUE KEY uq_product_attribute_values_group_lower_value (group_name, value_lower),
  KEY idx_product_attribute_values_group (group_name, `position`),
  KEY idx_product_attribute_values_active (active),
  CONSTRAINT ck_product_attribute_values_hex CHECK (hex IS NULL OR hex REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE size_charts (
  id            UUID         NOT NULL DEFAULT (UUID_v4()),
  fit           VARCHAR(60)  NOT NULL,
  title         VARCHAR(160) NOT NULL,
  unit          VARCHAR(4)   NOT NULL DEFAULT 'in',
  column_keys   JSON         NOT NULL,
  measurements  JSON         NOT NULL,
  `position`    INT          NOT NULL DEFAULT 0,
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY size_charts_fit_key (fit),
  KEY idx_size_charts_published (active, `position`, fit),
  CONSTRAINT chk_size_charts_column_keys CHECK (
    JSON_TYPE(column_keys) = 'ARRAY'
    AND JSON_LENGTH(column_keys) BETWEEN 2 AND 9
    AND JSON_VALUE(column_keys, '$[0]') = 'size'),
  CONSTRAINT chk_size_charts_measurements CHECK (
    JSON_TYPE(measurements) = 'ARRAY'
    AND JSON_LENGTH(measurements) BETWEEN 1 AND 40),
  CONSTRAINT chk_size_charts_fit CHECK (CHAR_LENGTH(TRIM(fit)) > 0),
  CONSTRAINT chk_size_charts_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT chk_size_charts_unit CHECK (unit IN ('in', 'cm'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- -----------------------------------------------------------------------------
-- Customers & admins
-- -----------------------------------------------------------------------------

CREATE TABLE customers (
  id          UUID         NOT NULL DEFAULT (UUID_v4()),
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  password    CHAR(60)     NOT NULL,
  deleted_at  DATETIME(6)  NULL,
  created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- was: UNIQUE INDEX customers_email_unique ON customers (lower(email)) WHERE deleted_at IS NULL
  email_live  VARCHAR(255) AS (IF(deleted_at IS NULL, LOWER(email), NULL)) VIRTUAL INVISIBLE,
  -- was: UNIQUE INDEX customers_phone_unique ON customers (phone) WHERE deleted_at IS NULL
  phone_live  VARCHAR(20)  AS (IF(deleted_at IS NULL, phone, NULL)) VIRTUAL INVISIBLE,
  PRIMARY KEY (id),
  UNIQUE KEY customers_email_unique (email_live),
  UNIQUE KEY customers_phone_unique (phone_live),
  KEY idx_customers_email (email),
  KEY idx_customers_phone (phone),
  KEY idx_customers_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE customer_addresses (
  id           UUID         NOT NULL DEFAULT (UUID_v4()),
  customer_id  UUID         NOT NULL,
  label        VARCHAR(40)  NULL,
  line1        VARCHAR(255) NOT NULL,
  line2        VARCHAR(255) NULL,
  landmark     VARCHAR(255) NULL,
  city         VARCHAR(120) NOT NULL,
  state        VARCHAR(120) NOT NULL,
  postal_code  VARCHAR(12)  NOT NULL,
  country      VARCHAR(80)  NOT NULL DEFAULT 'India',
  is_default   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  -- was: UNIQUE INDEX uq_customer_addresses_one_default ON customer_addresses (customer_id) WHERE is_default
  default_customer_id UUID AS (IF(is_default, customer_id, NULL)) VIRTUAL INVISIBLE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_addresses_one_default (default_customer_id),
  KEY idx_customer_addresses_customer (customer_id, is_default DESC, created_at),
  CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_customer_addresses_postal_code CHECK (postal_code REGEXP '^[1-9][0-9]{5}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE admins (
  id                   UUID         NOT NULL DEFAULT (UUID_v4()),
  name                 VARCHAR(255) NOT NULL,
  email                VARCHAR(255) NOT NULL,
  password             CHAR(60)     NOT NULL,
  role                 VARCHAR(32)  NOT NULL DEFAULT 'admin',
  active               BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at        DATETIME(6)  NULL,
  deleted_at           DATETIME(6)  NULL,
  created_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  password_changed_at  DATETIME(6)  NULL,
  -- was: UNIQUE INDEX admins_email_unique ON admins (email) WHERE deleted_at IS NULL
  email_live           VARCHAR(255) AS (IF(deleted_at IS NULL, email, NULL)) VIRTUAL INVISIBLE,
  PRIMARY KEY (id),
  UNIQUE KEY admins_email_unique (email_live),
  KEY admins_created_at_idx (created_at),
  KEY admins_deleted_at_idx (deleted_at),
  CONSTRAINT admins_role_check CHECK (role IN ('admin', 'super_admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE admin_password_reset_tokens (
  id            UUID        NOT NULL DEFAULT (UUID_v4()),
  admin_id      UUID        NOT NULL,
  token_hash    CHAR(64)    NOT NULL,
  expires_at    DATETIME(6) NOT NULL,
  used_at       DATETIME(6) NULL,
  requested_ip  VARCHAR(64) NULL,
  created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_password_reset_tokens_hash (token_hash),
  KEY idx_admin_password_reset_tokens_admin (admin_id, created_at DESC),
  CONSTRAINT admin_password_reset_tokens_admin_id_fkey FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE password_reset_tokens (
  id            UUID        NOT NULL DEFAULT (UUID_v4()),
  customer_id   UUID        NOT NULL,
  token_hash    CHAR(64)    NOT NULL,
  expires_at    DATETIME(6) NOT NULL,
  used_at       DATETIME(6) NULL,
  requested_ip  VARCHAR(64) NULL,
  created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
  KEY idx_password_reset_tokens_customer (customer_id, created_at DESC),
  CONSTRAINT password_reset_tokens_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE refresh_tokens (
  id              UUID        NOT NULL DEFAULT (UUID_v4()),
  family_id       UUID        NOT NULL,
  subject_id      UUID        NOT NULL,
  typ             VARCHAR(16) NOT NULL,
  token_hash      CHAR(64)    NOT NULL,
  expires_at      DATETIME(6) NOT NULL,
  used_at         DATETIME(6) NULL,
  revoked_at      DATETIME(6) NULL,
  revoked_reason  VARCHAR(32) NULL,
  user_agent      TEXT        NULL,
  ip              VARCHAR(45) NULL,   -- was inet
  created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_family (family_id),
  KEY idx_refresh_tokens_subject (typ, subject_id),
  KEY idx_refresh_tokens_expires (expires_at),
  CONSTRAINT refresh_tokens_typ_check CHECK (typ IN ('admin', 'customer')),
  CONSTRAINT refresh_tokens_reason_check CHECK (
    revoked_reason IS NULL
    OR revoked_reason IN ('logout', 'reuse_detected', 'rotated_out', 'password_reset', 'password_change'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- -----------------------------------------------------------------------------
-- Orders & payments
-- -----------------------------------------------------------------------------

-- Postgres: orders_number_seq. NOCACHE matters: MariaDB's default CACHE 1000
-- would skip up to 1000 order numbers on every server restart. The data copy
-- sets the next value to match Neon.
CREATE SEQUENCE orders_number_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE orders (
  id                    UUID          NOT NULL DEFAULT (UUID_v4()),
  order_number          VARCHAR(24)   NULL,
  customer_id           UUID          NULL,
  contact_name          VARCHAR(255)  NOT NULL,
  contact_email         VARCHAR(255)  NULL,
  contact_phone         VARCHAR(20)   NOT NULL,
  shipping_line1        VARCHAR(255)  NOT NULL,
  shipping_line2        VARCHAR(255)  NULL,
  shipping_landmark     VARCHAR(255)  NULL,
  shipping_city         VARCHAR(120)  NOT NULL,
  shipping_state        VARCHAR(120)  NOT NULL,
  shipping_postal_code  VARCHAR(12)   NOT NULL,
  shipping_country      VARCHAR(80)   NOT NULL DEFAULT 'India',
  status                VARCHAR(32)   NOT NULL DEFAULT 'pending_payment',
  payment_status        VARCHAR(32)   NOT NULL DEFAULT 'pending',
  subtotal              DECIMAL(10,2) NOT NULL,
  shipping_fee          DECIMAL(10,2) NOT NULL DEFAULT 0,
  total                 DECIMAL(10,2) NOT NULL,
  currency              CHAR(3)       NOT NULL DEFAULT 'INR',
  customer_note         TEXT          NULL,
  admin_note            TEXT          NULL,
  cancellation_reason   TEXT          NULL,
  placed_at             DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  paid_at               DATETIME(6)   NULL,
  packed_at             DATETIME(6)   NULL,
  shipped_at            DATETIME(6)   NULL,
  delivered_at          DATETIME(6)   NULL,
  cancelled_at          DATETIME(6)   NULL,
  created_at            DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at            DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  courier_name          VARCHAR(80)   NULL,
  tracking_number       VARCHAR(80)   NULL,
  tracking_url          VARCHAR(500)  NULL,
  refunded_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_number (order_number),
  KEY idx_orders_customer_placed (customer_id, placed_at DESC),
  KEY idx_orders_contact_email (contact_email),
  KEY idx_orders_status_placed (status, placed_at DESC),
  KEY idx_orders_payment_status (payment_status),
  KEY idx_orders_placed_at (placed_at DESC),
  KEY idx_orders_open_drafts (status, order_number, placed_at),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT orders_status_check CHECK (status IN ('pending_payment', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled')),
  CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'partially_refunded', 'failed', 'refunded')),
  CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0),
  CONSTRAINT orders_shipping_fee_check CHECK (shipping_fee >= 0),
  CONSTRAINT orders_total_check CHECK (total >= 0),
  CONSTRAINT orders_total_sums_check CHECK (total = subtotal + shipping_fee),
  CONSTRAINT orders_refunded_amount_check CHECK (refunded_amount >= 0 AND refunded_amount <= total)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE order_items (
  id            UUID          NOT NULL DEFAULT (UUID_v4()),
  order_id      UUID          NOT NULL,
  product_id    UUID          NULL,
  variant_id    UUID          NULL,
  product_name  VARCHAR(200)  NOT NULL,
  product_slug  VARCHAR(255)  NULL,
  size          VARCHAR(20)   NULL,
  image_url     TEXT          NULL,
  unit_price    DECIMAL(10,2) NOT NULL,
  quantity      INT           NOT NULL,
  line_total    DECIMAL(10,2) AS (unit_price * quantity) STORED,
  created_at    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  colour        VARCHAR(40)   NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  -- Postgres had WHERE variant_id IS NOT NULL; a MariaDB UNIQUE key already
  -- ignores rows with a NULL in it, so the plain key behaves the same.
  UNIQUE KEY uq_order_items_order_variant (order_id, variant_id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  KEY idx_order_items_variant (variant_id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES orders (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id)
    REFERENCES product_variants (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE payments (
  id                   UUID          NOT NULL DEFAULT (UUID_v4()),
  order_id             UUID          NOT NULL,
  provider             VARCHAR(32)   NOT NULL DEFAULT 'razorpay',
  provider_order_id    VARCHAR(255)  NOT NULL,
  provider_payment_id  VARCHAR(255)  NULL,
  status               VARCHAR(32)   NOT NULL DEFAULT 'created',
  amount               DECIMAL(10,2) NOT NULL,
  currency             CHAR(3)       NOT NULL DEFAULT 'INR',
  method               VARCHAR(32)   NULL,
  error_code           VARCHAR(64)   NULL,
  error_description    TEXT          NULL,
  created_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  paid_at              DATETIME(6)   NULL,
  updated_at           DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_provider_order (provider, provider_order_id),
  UNIQUE KEY uq_payments_provider_payment (provider, provider_payment_id),
  KEY idx_payments_order_created (order_id, created_at DESC),
  KEY idx_payments_provider_payment (provider_payment_id),
  KEY idx_payments_status (status),
  CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES orders (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT payments_status_check CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  CONSTRAINT payments_amount_check CHECK (amount >= 0),
  CONSTRAINT payments_paid_has_reference_check CHECK (status <> 'paid' OR provider_payment_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE payment_refunds (
  id                  UUID          NOT NULL DEFAULT (UUID_v4()),
  payment_id          UUID          NOT NULL,
  provider            VARCHAR(32)   NOT NULL DEFAULT 'razorpay',
  provider_refund_id  VARCHAR(255)  NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  created_at          DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_refunds_provider_refund (provider, provider_refund_id),
  KEY idx_payment_refunds_payment (payment_id),
  CONSTRAINT payment_refunds_payment_id_fkey FOREIGN KEY (payment_id)
    REFERENCES payments (id) ON DELETE CASCADE,
  CONSTRAINT payment_refunds_amount_check CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE email_messages (
  id                   UUID         NOT NULL DEFAULT (UUID_v4()),
  dedupe_key           VARCHAR(255) NOT NULL,
  order_id             UUID         NOT NULL,
  kind                 VARCHAR(40)  NOT NULL,
  audience             VARCHAR(16)  NOT NULL,
  to_email             VARCHAR(255) NOT NULL,
  status               VARCHAR(16)  NOT NULL DEFAULT 'pending',
  attempts             INT          NOT NULL DEFAULT 0,
  next_attempt_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  provider_message_id  VARCHAR(100) NULL,
  error_code           VARCHAR(32)  NULL,
  error_detail         TEXT         NULL,
  created_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  sent_at              DATETIME(6)  NULL,
  failed_at            DATETIME(6)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_messages_dedupe_key (dedupe_key),
  KEY idx_email_messages_due (status, next_attempt_at),
  KEY idx_email_messages_order (order_id, created_at DESC),
  CONSTRAINT email_messages_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT email_messages_attempts_check CHECK (attempts >= 0),
  CONSTRAINT email_messages_audience_check CHECK (audience IN ('customer', 'admin')),
  CONSTRAINT email_messages_kind_check CHECK (kind IN ('order_confirmed', 'order_packed', 'order_shipped', 'order_delivered', 'order_cancelled', 'admin_new_order')),
  CONSTRAINT email_messages_status_check CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- -----------------------------------------------------------------------------
-- Customer engagement
-- -----------------------------------------------------------------------------

CREATE TABLE wishlist_items (
  id           UUID        NOT NULL DEFAULT (UUID_v4()),
  customer_id  UUID        NOT NULL,
  product_id   UUID        NOT NULL,
  created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_customer_product (customer_id, product_id),
  KEY idx_wishlist_customer_created (customer_id, created_at DESC),
  KEY idx_wishlist_product (product_id),
  CONSTRAINT wishlist_items_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT wishlist_items_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE reviews (
  id           UUID         NOT NULL DEFAULT (UUID_v4()),
  product_id   UUID         NOT NULL,
  customer_id  UUID         NULL,
  author_name  VARCHAR(120) NOT NULL,
  rating       SMALLINT     NOT NULL,
  title        VARCHAR(150) NULL,
  body         TEXT         NULL,
  published    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_reviews_product_created (product_id, created_at DESC),
  KEY idx_reviews_product_published (product_id, published, created_at DESC),
  KEY idx_reviews_created (created_at DESC),
  CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- -----------------------------------------------------------------------------
-- Storefront content
-- -----------------------------------------------------------------------------

CREATE TABLE banners (
  id               UUID         NOT NULL DEFAULT (UUID_v4()),
  image            VARCHAR(500) NOT NULL,
  image_public_id  VARCHAR(255) NOT NULL,
  `position`       INT          NOT NULL DEFAULT 0,
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  product_id       UUID         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_banners_image_public_id (image_public_id),
  KEY idx_banners_active (active, `position`, created_at),
  KEY idx_banners_product (product_id),
  CONSTRAINT banners_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_banners_image CHECK (CHAR_LENGTH(TRIM(image)) > 0),
  CONSTRAINT chk_banners_image_public_id CHECK (CHAR_LENGTH(TRIM(image_public_id)) > 0),
  CONSTRAINT chk_banners_position CHECK (`position` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE customer_stories (
  id               UUID         NOT NULL DEFAULT (UUID_v4()),
  customer_name    VARCHAR(120) NULL,
  body             TEXT         NULL,
  image            VARCHAR(500) NOT NULL,
  image_public_id  VARCHAR(255) NOT NULL,
  product_id       UUID         NULL,
  `position`       INT          NOT NULL DEFAULT 0,
  published        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_stories_image_public_id (image_public_id),
  KEY idx_customer_stories_product (product_id),
  KEY idx_customer_stories_published (published, `position`, created_at DESC),
  CONSTRAINT customer_stories_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_customer_stories_image CHECK (CHAR_LENGTH(TRIM(image)) > 0 AND CHAR_LENGTH(TRIM(image_public_id)) > 0),
  CONSTRAINT chk_customer_stories_name CHECK (customer_name IS NULL OR CHAR_LENGTH(TRIM(customer_name)) > 0),
  CONSTRAINT chk_customer_stories_position CHECK (`position` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE home_sections (
  id          UUID         NOT NULL DEFAULT (UUID_v4()),
  title       VARCHAR(80)  NOT NULL,
  subtitle    VARCHAR(200) NULL,
  slug        VARCHAR(100) NOT NULL,
  starts_at   DATETIME(6)  NULL,
  ends_at     DATETIME(6)  NULL,
  `position`  INT          NOT NULL DEFAULT 0,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  layout      VARCHAR(20)  NOT NULL DEFAULT 'cards',
  theme       VARCHAR(20)  NOT NULL DEFAULT 'maroon-gold',
  created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_home_sections_slug (slug),
  KEY idx_home_sections_active (active, `position`, created_at),
  CONSTRAINT chk_home_sections_layout CHECK (layout IN ('festival', 'cards', 'editorial')),
  CONSTRAINT chk_home_sections_position CHECK (`position` >= 0),
  CONSTRAINT chk_home_sections_slug CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT chk_home_sections_subtitle CHECK (subtitle IS NULL OR CHAR_LENGTH(TRIM(subtitle)) > 0),
  CONSTRAINT chk_home_sections_theme CHECK (theme IN ('maroon-gold', 'turmeric-leaf', 'emerald', 'saffron-navy', 'ink-blush')),
  CONSTRAINT chk_home_sections_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT chk_home_sections_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE home_section_products (
  section_id  UUID NOT NULL,
  product_id  UUID NOT NULL,
  `position`  INT  NOT NULL,
  PRIMARY KEY (section_id, product_id),
  KEY idx_home_section_products_order (section_id, `position`),
  KEY idx_home_section_products_product (product_id),
  CONSTRAINT home_section_products_section_id_fkey FOREIGN KEY (section_id)
    REFERENCES home_sections (id) ON DELETE CASCADE,
  CONSTRAINT home_section_products_product_id_fkey FOREIGN KEY (product_id)
    REFERENCES products (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_home_section_products_position CHECK (`position` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE recent_order_popup_settings (
  id               SMALLINT    NOT NULL DEFAULT 1,
  enabled          BOOLEAN     NOT NULL DEFAULT FALSE,
  lookback_days    SMALLINT    NOT NULL DEFAULT 7,
  display_mode     VARCHAR(16) NOT NULL DEFAULT 'timer',
  visible_seconds  SMALLINT    NOT NULL DEFAULT 6,
  gap_seconds      SMALLINT    NOT NULL DEFAULT 5,
  updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT recent_order_popup_single_row CHECK (id = 1),
  CONSTRAINT recent_order_popup_display_mode_check CHECK (display_mode IN ('timer', 'until_closed')),
  CONSTRAINT recent_order_popup_lookback_check CHECK (lookback_days >= 1 AND lookback_days <= 90),
  CONSTRAINT recent_order_popup_visible_check CHECK (visible_seconds >= 3 AND visible_seconds <= 60),
  CONSTRAINT recent_order_popup_gap_check CHECK (gap_seconds >= 1 AND gap_seconds <= 600)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- -----------------------------------------------------------------------------
-- Migration bookkeeping (for the MariaDB migration runner)
-- -----------------------------------------------------------------------------

CREATE TABLE schema_migrations (
  filename    VARCHAR(255) NOT NULL,
  applied_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;
