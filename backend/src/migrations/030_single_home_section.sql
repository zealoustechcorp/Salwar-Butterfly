-- src/migrations/030_single_home_section.sql
--
-- The home page has one hand-picked section, not two. The shop renames it
-- for whatever it needs — "Best sellers" one month, "Diwali Sale" the next,
-- "Pongal Specials" after that — and picks its pieces. Everything else on
-- the home page is automatic.
--
-- 029 made two fixed sections, "best-sellers" and "custom". This folds the
-- first into the second and removes it:
--
--   - If "custom" has no pieces yet, it takes "best-sellers"' name, line
--     and pieces, in their order, so what shoppers see does not disappear.
--     If "custom" already has pieces, the shop chose them, and they stay.
--   - "best-sellers" is then deleted; its picks go with it (ON DELETE
--     CASCADE on home_section_products).
--
-- One transaction, as every migration here is: the copy and the delete
-- land together or not at all. Safe to re-run — once "best-sellers" is
-- gone, every statement finds nothing to do.

UPDATE home_sections AS custom
SET title      = best.title,
    subtitle   = best.subtitle,
    position   = 1,
    updated_at = NOW()
FROM home_sections AS best
WHERE custom.slug = 'custom'
  AND best.slug = 'best-sellers'
  AND NOT EXISTS (
    SELECT 1 FROM home_section_products hsp WHERE hsp.section_id = custom.id
  );

INSERT INTO home_section_products (section_id, product_id, position)
SELECT custom.id, hsp.product_id, hsp.position
FROM home_sections AS custom
JOIN home_sections AS best ON best.slug = 'best-sellers'
JOIN home_section_products AS hsp ON hsp.section_id = best.id
WHERE custom.slug = 'custom'
  AND NOT EXISTS (
    SELECT 1 FROM home_section_products own WHERE own.section_id = custom.id
  );

DELETE FROM home_sections WHERE slug = 'best-sellers';

UPDATE home_sections
SET position = 1, active = TRUE, updated_at = NOW()
WHERE slug = 'custom';
