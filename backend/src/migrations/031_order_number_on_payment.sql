-- src/migrations/031_order_number_on_payment.sql
--
-- An order is not placed until it is paid for.
--
-- Checkout still writes the row first — the stock has to be held while
-- the shopper is on the Razorpay sheet, and the payment needs an amount
-- read from the database — but that row is a checkout *draft*, not an
-- order. It has no number, nobody is told about it, and no screen lists
-- it. It becomes an order at the moment its payment settles, which is
-- when it is given its number (see ASSIGN_ORDER_NUMBER_SQL in
-- order.policy.js). A draft that is never paid is cancelled by the
-- sweeper after CHECKOUT_HOLD_MINUTES and its stock goes back.
--
-- So `order_number IS NULL` is what "draft" means, and the sequence only
-- advances for orders that were actually placed — no gaps from abandoned
-- checkouts.
--
-- Orders written before this migration keep the numbers they have. The
-- UNIQUE constraint allows any number of NULLs.
--
-- Safe to re-run: dropping a default or a NOT NULL that is already gone
-- is a no-op.

ALTER TABLE orders ALTER COLUMN order_number DROP DEFAULT;

ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL;

-- The sweeper's question, every minute: which drafts have run out of
-- time. Partial, so it stays the size of the drafts in flight rather
-- than of the whole order book.
CREATE INDEX IF NOT EXISTS idx_orders_open_drafts
  ON orders (placed_at)
  WHERE order_number IS NULL AND status = 'pending_payment';
