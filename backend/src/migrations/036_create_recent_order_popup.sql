-- src/migrations/036_create_recent_order_popup.sql
--
-- The "someone just bought this" pop-up on the storefront (F-09.09).
--
-- One row, forever (id pinned to 1): the shop's switch and four settings.
--
--   enabled          off by default; nothing shows until the shop turns it on
--   lookback_days    only orders paid in the last N days are shown
--   display_mode     'until_closed' — a pop-up stays until the shopper
--                      clicks the ✕;
--                    'timer' — it hides itself after visible_seconds
--   visible_seconds  how long a pop-up shows, in timer mode only
--   gap_seconds      how long after a pop-up disappears — timer ran out or
--                    ✕ clicked, the same either way — before the next one;
--                    also the wait before the first one after a page loads
--
-- Ranges are repeated in src/config/recent_order_popup.policy.js.
--
-- No customer data lives here. Which orders the pop-up shows is read live
-- from `orders` by storefront.repository.js, and the only customer detail
-- it ever publishes is the shipping city.
--
-- A database that ran an earlier draft of this table gets the same fresh
-- table from 040_recent_order_popup_fresh.sql.

CREATE TABLE IF NOT EXISTS recent_order_popup_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lookback_days SMALLINT NOT NULL DEFAULT 7,
  display_mode VARCHAR(16) NOT NULL DEFAULT 'timer',
  visible_seconds SMALLINT NOT NULL DEFAULT 6,
  gap_seconds SMALLINT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recent_order_popup_single_row CHECK (id = 1),
  CONSTRAINT recent_order_popup_lookback_check CHECK (lookback_days BETWEEN 1 AND 90),
  CONSTRAINT recent_order_popup_display_mode_check
    CHECK (display_mode IN ('timer', 'until_closed')),
  CONSTRAINT recent_order_popup_visible_check CHECK (visible_seconds BETWEEN 3 AND 60),
  CONSTRAINT recent_order_popup_gap_check CHECK (gap_seconds BETWEEN 1 AND 600)
);

INSERT INTO recent_order_popup_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
