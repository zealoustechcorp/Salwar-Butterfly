# Salwar Butterfly — Brand Palette & Typography

**Status:** adopted 2026-08-20 · **Source:** colors sampled pixel-by-pixel from the logo
(`frontend/public/Salwar Butterfly.jpeg`), then verified with the WCAG 2.1 relative-luminance
formula (the math behind whocanuse.com). AAA thresholds: **7 : 1** normal text, **4.5 : 1**
large text (18pt+, or 14pt bold).

Live reference artifact (specimens rendered on their real backgrounds):
<https://claude.ai/code/artifact/bb9eb0f6-99d4-44e5-85ad-00e8ac40c8e8>

---

## 1. Logo

The brand logo is `frontend/public/Salwar Butterfly.jpeg` (served at `/Salwar Butterfly.jpeg`).
It is a square, cream-ground mark; place it on cream/white surfaces, never on dark fills, and
give it a `brand-200` hairline ring when it sits on white (see the admin sidebar in
`frontend/src/components/admin/AdminShell.js`).

## 2. Colors measured from the logo

| Name | Hex | Where it appears in the logo |
|---|---|---|
| Cream | `#FDF7F1` | Background |
| Burgundy | `#64252E` | "SALWAR" wordmark |
| Deep maroon | `#5D2826` | Butterfly outlines, script flourishes |
| Espresso | `#58321C` | Hair, "DRESS SHOP" text |
| Dusty pink | `#D49A9B` | "BUTTERFLY" text, pink butterflies |
| Blush | `#EBCBC0` | Dupatta, light butterfly wings |
| Rose gold | `#BC8A69` | Ring, vines, ornaments |

## 3. Storefront tokens (`sb-*`)

Defined in `frontend/src/app/globals.css` under `@theme`; Tailwind v4 generates utilities from
them (`bg-sb-bg`, `text-sb-heading`, …). Names follow **role, not hue**.

### Grounds

| Token | Hex | Use |
|---|---|---|
| `sb-bg` | `#FDF7F1` | Cream — page ground |
| `sb-surface` | `#EBCBC0` | Blush — cards |
| `sb-surface-pink` | `#D49A9B` | Dusty pink — badges, bands |

### Inks — all AAA on `sb-bg` (ratios only improve on white)

| Token | Hex | Ratio on cream | Role |
|---|---|---|---|
| `sb-text` | `#3E1A18` | 14.46 : 1 | Body text |
| `sb-heading` | `#64252E` | 10.70 : 1 | Headings / brand (exact wordmark) |
| `sb-text-muted` | `#58321C` | 10.46 : 1 | Secondary text |
| `sb-link` | `#8A2E4B` | 7.68 : 1 | Links, accent text |
| `sb-gold-text` | `#7A4527` | 7.29 : 1 | Gold captions/labels (darkened from `#BC8A69`) |
| `sb-ink-on-pink` | `#2B1413` | 7.34 : 1 *on `sb-surface-pink`* | Text on dusty-pink fills |

Blush-surface pairings: `sb-text` on `sb-surface` = 10.13 : 1 (AAA); `sb-heading` on
`sb-surface` = 7.50 : 1 (AAA).

### Dark fills — carry cream `#FDF7F1` text, all AAA

| Token | Hex | Ratio vs cream | Use |
|---|---|---|---|
| `sb-btn-primary` | `#64252E` | 10.70 : 1 | Primary buttons |
| `sb-btn-rose` | `#8A2E4B` | 7.68 : 1 | Secondary/rose buttons |
| `sb-footer` | `#3E1A18` | 14.46 : 1 | Footer, dark sections |

### Ornament only — **never as text**

| Token | Hex | Ratio on cream | Use |
|---|---|---|---|
| `sb-gold` | `#BC8A69` | 2.83 : 1 (fails AA/AAA) | Hairlines, dividers, icon strokes beside a label, hover glows |
| `sb-pink-deco` | `#D49A9B` | 2.22 : 1 (fails AA/AAA) | Backgrounds, badge fills (with `sb-ink-on-pink` text), illustrations |
| `sb-maroon-deco` | `#5D2826` | 10.99 : 1 (text-safe too) | Butterfly-outline decorations |

## 4. Admin scales (`brand-*`, `gold-*`)

The F-03 admin console keeps its slate `ink-*` neutrals for data density, but its `brand-*`
and `gold-*` scales (also in `globals.css`) are now **derived from the logo palette**:

- `brand-600 #8A2E4B` (rose, primary buttons — 8.16 : 1 with white text) →
  `brand-700 #71263C` (hover, 10.27 : 1) → `brand-800 #64252E` (exact wordmark burgundy).
- `gold-500 #BC8A69` is the logo's rose gold; `gold-700 #7A4527` is the AAA text step.

**Gold rule — `gold-500` is a surface/ornament step, never a text-bearing fill.**
White on `gold-500` is only **3.01 : 1** (fails AA). Any gold fill that carries text uses
`gold-700` (white on it = 7.75 : 1, AAA), hovering to `gold-800` (9.78 : 1). Gold *text* on a
pale gold surface uses `gold-700` on `gold-50` (7.22 : 1) or `gold-800` on `gold-100`
(8.19 : 1). This is the same constraint as the storefront's "ornament only" row — rose gold is
too light to carry text at any size.

Verified AAA in the admin: white on `brand-600` 8.16 : 1 · white on `brand-700` 10.27 : 1 ·
`brand-700` on `brand-50` 9.41 : 1 · white on `gold-700` 7.75 : 1 · `gold-700` on `gold-50`
7.22 : 1 · `gold-800` on `gold-100` 8.19 : 1.

Components use scale steps, never raw hexes, so the retheme itself touched no component code —
only the four gold combinations above needed a step change.

## 5. Typography

| Role | Family | Weights | Token / utility | Fallback stack |
|---|---|---|---|---|
| Display / headings | **Cormorant Garamond** | 500, 600, + italics | `font-display` | `"Palatino Linotype", Palatino, serif` |
| Body / UI | **Karla** | 400, 500, 700 | `font-body` | `"Segoe UI", system-ui, sans-serif` |

Both load via `next/font/google` in `frontend/src/app/layout.js`
(`--font-cormorant`, `--font-karla`). The admin shell (`.admin-root`) uses Karla with Geist as
fallback.

Rules:

- Cormorant is **headings-only** — its hairlines get muddy below ~20px. Never body text.
- Small-caps labels (like "DRESS SHOP" in the logo): Karla 700 uppercase with
  `letter-spacing: 0.2em` — no third font.
- Prices, order tables, SKU columns: add `tabular-nums` (`.tabular` helper exists).
- Script flourishes: skip a script font; let the logo image carry the script. If one is ever
  truly needed, Great Vibes — one place per page, never for actionable text.
- Tamil content, if it ever ships, needs `Noto Serif Tamil` / `Noto Sans Tamil` appended to
  the fallback stacks — neither brand family covers the Tamil script.

## 6. Quick do / don't

- ✅ Cream ground, dark burgundy ink, rose links, gold hairlines.
- ✅ Cream text on burgundy/rose/espresso fills.
- ❌ Rose gold `#BC8A69` or dusty pink `#D49A9B` as text at any size on light grounds.
- ❌ Cormorant below heading sizes; Karla for wordmark-style display moments.
