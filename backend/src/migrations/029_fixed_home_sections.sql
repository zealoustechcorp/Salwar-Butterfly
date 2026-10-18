-- src/migrations/029_fixed_home_sections.sql
--
-- The home page has exactly two hand-picked sections, fixed by the shop's
-- decision rather than created and deleted from the admin screen:
--
--   best-sellers   "Best sellers"
--   custom         "Custom section" — renamed to whatever is running:
--                  "Diwali Sale", "Pongal Specials", a collection
--
-- The admin can change each one's name, the line under it and its pieces,
-- and nothing else. The slug is the fixed key the admin API and the product
-- page's checkboxes address a section by.
--
-- What this does to the rows already there (028):
--   - "best-sellers" keeps its title, line and pieces; it is switched on,
--     its dates are cleared and it is put first.
--   - "custom" is added if it is missing, second, with no pieces — an
--     empty section is not drawn on the home page.
--   - Any other section is switched off rather than deleted, so nothing
--     the shop picked is lost. The admin screen no longer lists them.
--
-- The start/end dates, the switch, the position, the layout and the theme
-- columns stay on the table, unused by the admin screen, so this file
-- changes data only and is safe to re-run.

INSERT INTO home_sections (title, subtitle, slug, position, active)
VALUES
  ('Best sellers', 'The pieces our customers order again and again.', 'best-sellers', 1, TRUE),
  ('Custom section', NULL, 'custom', 2, TRUE)
ON CONFLICT (slug) DO NOTHING;

UPDATE home_sections
SET active     = TRUE,
    starts_at  = NULL,
    ends_at    = NULL,
    position   = CASE slug WHEN 'best-sellers' THEN 1 ELSE 2 END,
    updated_at = NOW()
WHERE slug IN ('best-sellers', 'custom');

UPDATE home_sections
SET active     = FALSE,
    updated_at = NOW()
WHERE slug NOT IN ('best-sellers', 'custom')
  AND active;
