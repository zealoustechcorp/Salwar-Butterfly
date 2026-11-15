-- src/migrations/040_recent_order_popup_fresh.sql
--
-- Rebuilds the recent-order pop-up's settings table (F-09.09) in its final,
-- simpler shape. Earlier drafts (an older 036, and 037–039, since removed)
-- added and dropped columns one at a time: first_delay_seconds,
-- interval_seconds, close_delay_seconds. The settings are now just the
-- switch, the look-back window, the display mode, how long a pop-up shows
-- (timer mode) and the gap before the next one.
--
-- Drops and recreates rather than altering, so every database ends up
-- with exactly the table 036 describes, whichever draft it ran. The one
-- settings row is reset to the defaults (pop-up switched off): agreed with
-- the shop, and the table holds no order or customer data.
--
-- Keep in step with 036_create_recent_order_popup.sql.

DROP TABLE IF EXISTS recent_order_popup_settings;

CREATE TABLE recent_order_popup_settings (
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

INSERT INTO recent_order_popup_settings (id) VALUES (1);
