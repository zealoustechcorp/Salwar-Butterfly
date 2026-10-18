-- src/migrations/001_create_customers.sql
--
-- Shoppers' accounts (F-01).
--
-- This file previously contained a second copy of the `categories` table
-- — the same CREATE that 001_create_categories.sql already runs — and no
-- `customers` table at all. The table itself had been created by hand
-- back when the .sql files were applied that way, so nothing was broken
-- on the machine it was made on, and nothing showed it. What it did break
-- is every *fresh* database: 008_create_orders.sql declares a foreign key
-- to customers(id), so `npm run db:migrate` against an empty database
-- failed at 008 and had done since 008 was written.
--
-- The columns below are the ones CustomerRepository actually reads and
-- writes; the lengths match customer.rules.js so the validator and the
-- schema refuse the same input rather than one of them letting something
-- through for the other to reject with a 500.
--
-- Everything is IF NOT EXISTS, so applying this to the database that was
-- set up by hand is a no-op.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,

  email VARCHAR(255) NOT NULL,

  -- E.164 with the country code optional, which is what the validator
  -- accepts: at most 15 digits plus a leading '+'. Required, as on the
  -- live table — registration always collects one.
  phone VARCHAR(20) NOT NULL,

  -- A bcrypt hash, always 60 characters — CHAR(60), as on the live
  -- table. Changing the algorithm would mean widening this.
  --
  -- Never selected by the repository except in its findBy*ForAuth
  -- queries. That is a convention, not a guarantee, which is why the
  -- storefront reads go through a mapper that cannot see this column.
  password CHAR(60) NOT NULL,

  -- Soft delete. An order points at its customer with ON DELETE SET
  -- NULL, so a hard delete would quietly detach a shopper's order
  -- history from them; this keeps the row and the link while removing
  -- the account from every query that matters.
  deleted_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EMAIL UNIQUENESS
-- ============================================================
--
-- Partial and case-folded, matching the categories convention above it.
--
-- Case-folded because "Meera@gmail.com" and "meera@gmail.com" are one
-- person and one inbox, and letting both register is how a shopper ends
-- up with an order history split across two accounts.
--
-- Partial on deleted_at so that closing an account frees the address for
-- re-use. A shopper who leaves and comes back should not be told their
-- own email is taken.

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique
  ON customers (LOWER(email))
  WHERE deleted_at IS NULL;

-- The admin customer list, and looking a shopper up by email or by the
-- number they are calling from. Plain indexes, matching the live table.
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
