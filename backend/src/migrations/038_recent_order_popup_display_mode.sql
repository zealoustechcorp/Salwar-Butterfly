-- src/migrations/038_recent_order_popup_display_mode.sql
--
-- How the recent-order pop-up leaves the screen (F-09.09):
--
--   timer         each card hides itself after visible_seconds, and the
--                 next arrives interval_seconds after the last appeared.
--                 What the pop-up did before this column existed, so it is
--                 the default and nothing changes for a shop that already
--                 has it switched on.
--
--   until_closed  a card stays until the shopper closes it with the ✕;
--                 the next arrives 5 seconds after that. visible_seconds
--                 and interval_seconds are kept but not used.
--
-- Mirrors DISPLAY_MODES in src/config/recent_order_popup.policy.js.
-- Safe to re-run.

ALTER TABLE recent_order_popup_settings
  ADD COLUMN IF NOT EXISTS display_mode VARCHAR(16) NOT NULL DEFAULT 'timer';

ALTER TABLE recent_order_popup_settings
  DROP CONSTRAINT IF EXISTS recent_order_popup_display_mode_check;
ALTER TABLE recent_order_popup_settings
  ADD CONSTRAINT recent_order_popup_display_mode_check
  CHECK (display_mode IN ('timer', 'until_closed'));
