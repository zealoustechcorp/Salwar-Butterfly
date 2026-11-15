-- src/migrations/036_create_recent_order_popup.sql
--
-- The "someone just bought this" pop-up on the storefront (F-09.09).
--
-- One row, forever: the shop's switch for the pop-up and the three numbers
-- it may tune. `id` is pinned to 1 by a CHECK, so there is never a second
-- row to disagree with the first, and the service reads and writes that
-- row by its fixed key.
--
-- Off by default. Nothing appears on the storefront until the shop turns
-- it on from Admin > Home page > Recent orders pop-up.
--
-- The ranges are repeated in src/config/recent_order_popup.policy.js,
-- which is what the validator refuses on; these CHECKs only stop a value
-- nobody defined from reaching the table, including through psql.
--
-- No customer data lives here. Which orders the pop-up shows is read live
-- from `orders` by storefront.repository.js, and the only customer detail
-- it ever publishes is the shipping city.
--
-- Safe to re-run: IF NOT EXISTS, and the seed row is ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS recent_order_popup_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,

  enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- How far back an order may have been paid and still be shown.
  lookback_days SMALLINT NOT NULL DEFAULT 7,

  -- Seconds each pop-up stays on screen.
  visible_seconds SMALLINT NOT NULL DEFAULT 6,

  -- Seconds from one pop-up appearing to the next.
  interval_seconds SMALLINT NOT NULL DEFAULT 20,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recent_order_popup_single_row CHECK (id = 1),
  CONSTRAINT recent_order_popup_lookback_check
    CHECK (lookback_days BETWEEN 1 AND 90),
  CONSTRAINT recent_order_popup_visible_check
    CHECK (visible_seconds BETWEEN 3 AND 30),
  CONSTRAINT recent_order_popup_interval_check
    CHECK (interval_seconds BETWEEN 10 AND 600),
  -- A pop-up must be gone before the next one arrives.
  CONSTRAINT recent_order_popup_no_overlap_check
    CHECK (interval_seconds > visible_seconds)
);

INSERT INTO recent_order_popup_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
