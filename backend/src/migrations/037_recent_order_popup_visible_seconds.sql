-- src/migrations/037_recent_order_popup_visible_seconds.sql
--
-- Brings a recent_order_popup_settings table made by an earlier draft of
-- 036 up to the current shape (F-09.09):
--
--   - adds `visible_seconds`, how long each pop-up stays on screen
--     (3–30, default 6), now a shop setting rather than fixed;
--   - drops `first_delay_seconds`: the first pop-up always comes 5 seconds
--     after a page loads, so it is no longer a setting;
--   - adds the no-overlap rule: the gap between pop-ups must be longer
--     than the time each stays up.
--
-- On a database that ran the current 036 every statement is a no-op, so
-- this is safe to run anywhere and safe to re-run.

ALTER TABLE recent_order_popup_settings
  ADD COLUMN IF NOT EXISTS visible_seconds SMALLINT NOT NULL DEFAULT 6;

ALTER TABLE recent_order_popup_settings
  DROP CONSTRAINT IF EXISTS recent_order_popup_first_delay_check;

ALTER TABLE recent_order_popup_settings
  DROP COLUMN IF EXISTS first_delay_seconds;

-- An existing row may hold an interval the new rule refuses (only possible
-- if it is at or below the default 6 seconds on screen, which the old
-- 10-second minimum already ruled out). Kept anyway, so the constraint
-- below can never fail to add.
UPDATE recent_order_popup_settings
SET interval_seconds = visible_seconds + 1
WHERE interval_seconds <= visible_seconds;

ALTER TABLE recent_order_popup_settings
  DROP CONSTRAINT IF EXISTS recent_order_popup_visible_check;
ALTER TABLE recent_order_popup_settings
  ADD CONSTRAINT recent_order_popup_visible_check
  CHECK (visible_seconds BETWEEN 3 AND 30);

ALTER TABLE recent_order_popup_settings
  DROP CONSTRAINT IF EXISTS recent_order_popup_no_overlap_check;
ALTER TABLE recent_order_popup_settings
  ADD CONSTRAINT recent_order_popup_no_overlap_check
  CHECK (interval_seconds > visible_seconds);
