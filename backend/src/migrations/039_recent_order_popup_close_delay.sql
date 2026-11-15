-- src/migrations/039_recent_order_popup_close_delay.sql
--
-- How long after a shopper closes the recent-order pop-up (the ✕) the next
-- one appears (F-09.09). Used in both display modes; it was a fixed 5
-- seconds before this column, so 5 is the default and nothing changes for a
-- shop that already has the pop-up on. The first pop-up after a page loads
-- stays a fixed 5 seconds and is not this setting.
--
-- Mirrors CLOSE_DELAY_SECONDS in src/config/recent_order_popup.policy.js.
-- Safe to re-run.

ALTER TABLE recent_order_popup_settings
  ADD COLUMN IF NOT EXISTS close_delay_seconds SMALLINT NOT NULL DEFAULT 5;

ALTER TABLE recent_order_popup_settings
  DROP CONSTRAINT IF EXISTS recent_order_popup_close_delay_check;
ALTER TABLE recent_order_popup_settings
  ADD CONSTRAINT recent_order_popup_close_delay_check
  CHECK (close_delay_seconds BETWEEN 1 AND 600);
