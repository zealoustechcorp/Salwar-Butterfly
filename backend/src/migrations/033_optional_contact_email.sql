-- src/migrations/033_optional_contact_email.sql
--
-- Email is optional at checkout.
--
-- The phone number is what the courier and the shop actually use, and
-- asking every shopper for an email turned some of them away. An order
-- placed without one stores NULL: no customer emails are queued for it,
-- and it cannot be found through the guest tracking page (which matches on
-- order number + email) — signing in, or calling the shop, still works.

ALTER TABLE orders
  ALTER COLUMN contact_email DROP NOT NULL;
