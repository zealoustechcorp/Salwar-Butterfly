-- src/migrations/010_create_payments.sql
--
-- Payment attempts against an order (F-10).
--
-- A table rather than four more columns on `orders`, and the reason is
-- that payment is not one event. A shopper's card is declined, they try
-- again with UPI, the second one succeeds — that is one order and three
-- rows, and columns on `orders` can only remember the last of them. The
-- shop needs the others: "the card failed twice before it went through"
-- is the answer to the support call, and a refund has to point at the
-- specific attempt whose money is going back.
--
-- `orders.payment_status` stays where it is and stays authoritative for
-- "has this order been paid for". This table is the evidence behind that
-- one word, not a replacement for it. One flows into the other in
-- exactly one place — OrderRepository.confirmPayment — so the two cannot
-- disagree by taking different code paths.
--
-- Nothing here is ever updated after it reaches a terminal status, and
-- nothing is ever deleted. It is an audit trail; a row that can be
-- rewritten is not evidence of anything.

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  -- ----------------------------------------------------------
  -- PROVIDER
  -- ----------------------------------------------------------
  --
  -- Named on every row even though there is one provider today. The
  -- alternative is a table that silently means "Razorpay" until the day
  -- it does not, and then a migration that has to guess which historical
  -- rows were which.

  provider VARCHAR(32) NOT NULL DEFAULT 'razorpay',

  -- The provider's own order handle (Razorpay: `order_xxx`). Created
  -- before the shopper is shown a payment sheet, so this is set on
  -- every row from the moment it exists.
  --
  -- UNIQUE, and that is load-bearing: it is what makes webhook delivery
  -- idempotent. Razorpay retries a webhook it did not get a 2xx for,
  -- and without this a retry would open a second attempt for money that
  -- arrived once.
  provider_order_id VARCHAR(255) NOT NULL,

  -- The provider's payment handle (`pay_xxx`), known only once the
  -- shopper has actually paid. NULL on a created-but-abandoned attempt,
  -- which is the majority of rows on any storefront.
  provider_payment_id VARCHAR(255) NULL,

  -- ----------------------------------------------------------
  -- STATUS
  -- ----------------------------------------------------------
  --
  -- `created`   a payment sheet was opened. Means nothing about money.
  -- `paid`      verified. Either the return signature checked out or a
  --             signed webhook said so. Never set from an unverified
  --             client callback.
  -- `failed`    the provider told us it failed.
  -- `refunded`  the money went back.
  --
  -- Duplicated as a CHECK below and as PAYMENT_ATTEMPT_STATUS in
  -- src/config/payment.policy.js, on the same terms as the order
  -- statuses in 008: the module decides which moves are legal, the
  -- constraint only stops a value nobody defined from reaching the
  -- table, including through psql.

  status VARCHAR(32) NOT NULL DEFAULT 'created',

  -- ----------------------------------------------------------
  -- MONEY
  -- ----------------------------------------------------------
  --
  -- DECIMAL in rupees, matching orders.total — never a float, and never
  -- the provider's paise integer. Paise is Razorpay's wire format and it
  -- is converted at the edge; storing it here would mean every report
  -- that touches this table has to remember to divide by a hundred.
  --
  -- Recorded per attempt rather than read from the order, because the
  -- order's total may legitimately be edited before it is paid, and the
  -- question this row answers is "how much did we ask for at the time".

  amount DECIMAL(10,2) NOT NULL
    CHECK (amount >= 0),

  currency CHAR(3) NOT NULL DEFAULT 'INR',

  -- How they paid: 'card', 'upi', 'netbanking', 'wallet'. The
  -- provider's word, copied as-is and never parsed — it is for the
  -- shop's eyes and for support calls.
  method VARCHAR(32) NULL,

  -- ----------------------------------------------------------
  -- FAILURE
  -- ----------------------------------------------------------
  --
  -- Kept in the shop's own columns rather than as a blob. "Which card
  -- errors are we seeing this week" is a question a shop asks, and it
  -- should not require reading JSON.

  error_code VARCHAR(64) NULL,

  error_description TEXT NULL,

  -- ----------------------------------------------------------
  -- TIMESTAMPS
  -- ----------------------------------------------------------

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  paid_at TIMESTAMPTZ NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_payments_provider_order
    UNIQUE (provider, provider_order_id),

  -- A given provider payment may be recorded once. The second delivery
  -- of the same webhook hits this and is recognised as a repeat rather
  -- than banked twice.
  CONSTRAINT uq_payments_provider_payment
    UNIQUE (provider, provider_payment_id),

  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT payments_status_check
    CHECK (status IN (
      'created',
      'paid',
      'failed',
      'refunded'
    )),

  -- A paid row without the provider's payment id cannot be reconciled
  -- against a settlement report, and cannot be refunded. It is not a
  -- state worth allowing into the table.
  CONSTRAINT payments_paid_has_reference_check
    CHECK (status <> 'paid' OR provider_payment_id IS NOT NULL)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- "Show me this order's attempts" — the admin order page, and the only
-- query that runs on a screen a person is waiting in front of.
CREATE INDEX IF NOT EXISTS idx_payments_order_created
  ON payments (order_id, created_at DESC);

-- The webhook's lookup: it arrives knowing the provider's order id and
-- nothing else. UNIQUE above already indexes (provider, provider_order_id),
-- so this one only covers the reverse lookup from a payment id, which is
-- what a refund notification carries.
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment
  ON payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments (status);
