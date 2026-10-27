-- src/migrations/032_partial_refunds.sql
--
-- Partial refunds.
--
-- A refund.processed webhook used to mark the whole payment refunded and
-- the order's payment_status `refunded`, whatever the amount: ₹300 back
-- on a ₹1,850 order read as ₹1,850 refunded in the admin panel, and the
-- order dropped out of revenue entirely.
--
-- Now each refund is its own row, keyed by Razorpay's refund id so that a
-- redelivered webhook cannot count it twice. The order carries the
-- running total, and its payment_status is `partially_refunded` until the
-- refunds add up to what was paid. Revenue subtracts what was refunded.

CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  payment_id UUID NOT NULL REFERENCES payments (id) ON DELETE CASCADE,

  provider VARCHAR(32) NOT NULL DEFAULT 'razorpay',

  -- Razorpay: `rfnd_xxx`. UNIQUE per provider is what makes recording a
  -- refund idempotent.
  provider_refund_id VARCHAR(255) NOT NULL,

  -- In rupees, like payments.amount.
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_payment_refunds_provider_refund UNIQUE (provider, provider_refund_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON payment_refunds (payment_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- Allow the new status. The check is found by what it says rather than by
-- name: constraint names on the live database have been seen to differ
-- from the ones these files create.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'partially_refunded', 'failed', 'refunded'));

ALTER TABLE orders
  ADD CONSTRAINT orders_refunded_amount_check
  CHECK (refunded_amount >= 0 AND refunded_amount <= total);

-- Orders refunded before this migration were refunded in full, as far as
-- anything recorded them.
UPDATE orders SET refunded_amount = total WHERE payment_status = 'refunded';
