/**
 * SUPERSEDED — do not run this to refresh the storefront.
 *
 *   Use `npm run db:export-storefront` in ../backend instead.
 *
 * This pulled the *old* shop's catalogue (salwarbutterfly.in, integer product
 * ids) straight into `src/lib/store/live-catalogue.json`. That was right while
 * the storefront only had to display things.
 *
 * It is wrong now. Checkout (F-07) orders against a `product_variants.id`, and
 * this script writes no variant ids and no ids that exist in this project's
 * database — running it would leave a storefront that browses perfectly and
 * cannot sell anything, with no error to say why.
 *
 * The catalogue now lives in Postgres (loaded once by the backend's
 * `db:import-catalogue`) and the storefront snapshot is written from there.
 * The storefront is still frontend-only: it renders with no API and no
 * database, which is the part worth keeping.
 *
 * Kept, rather than deleted, as the record of where this data originally came
 * from — and in case the old shop ever needs to be re-read into a fresh
 * import. Writing to a path is required so it cannot clobber the live snapshot
 * by accident:
 *
 *   node scripts/snapshot-live-catalogue.mjs ./old-shop.json
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://swalar-butterfly.onrender.com/api";

// No default. This used to write straight over the storefront's snapshot, and
// doing that now would replace ids the shop can sell against with the old
// shop's integers — a storefront that browses and cannot check out.
const OUT = process.argv[2];

if (!OUT) {
  console.error(
    "This script is superseded — use `npm run db:export-storefront` in ../backend.\n" +
      "To re-read the old shop anyway, name an output file:\n" +
      "  node scripts/snapshot-live-catalogue.mjs ./old-shop.json",
  );
  process.exit(1);
}

// The API is on a free Render dyno and cold-starts slowly; a first request can
// take the better part of a minute.
async function get(endpoint) {
  const response = await fetch(`${API}/${endpoint}`, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${endpoint} -> HTTP ${response.status}`);
  return response.json();
}

const num = (value) => (value == null ? null : Number(value));

/** Percentage off, rounded — the shop stores a struck-through original_price. */
function discountPercent(price, mrp) {
  if (!mrp || mrp <= price) return 0;
  return Math.round((1 - price / mrp) * 100);
}

async function main() {
  console.log("fetching…");
  const [categories, products, settings] = await Promise.all([
    get("products/categories"),
    get("products"),
    get("settings"),
  ]);

  const rows = products
    .filter((p) => p.is_active && p.category_id != null && p.image_url)
    .map((p) => {
      const price = num(p.price);
      const mrp = num(p.original_price);
      return {
        id: p.id,
        name: String(p.name || "").trim(),
        price,
        mrp: mrp && mrp > price ? mrp : null,
        off: discountPercent(price, mrp),
        category_id: p.category_id,
        image: p.image_url,
        image2: p.image_url_2 || null,
        stock: Number(p.stock) || 0,
        // Per-size stock is what decides which size chips are selectable.
        sizes: (p.size_stock || [])
          .map((s) => ({ size: String(s.size), stock: Number(s.stock) || 0 }))
          .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true })),
        created_at: p.created_at,
      };
    });

  const live = new Set(rows.map((p) => p.category_id));

  let slides = [];
  try {
    slides = JSON.parse(settings.banner_slides || "[]")
      .map((s) => s.image)
      .filter(Boolean);
  } catch {
    slides = [];
  }

  const snapshot = {
    fetched_at: new Date().toISOString().slice(0, 10),
    source: "https://www.salwarbutterfly.in",
    shop: {
      name: settings.shop_name?.trim() || "Salwar Butterfly",
      tagline: settings.shop_tagline?.trim() || "",
      phone: settings.shop_phone?.trim() || "",
      email: settings.shop_email?.trim() || "",
      logo: settings.shop_logo_url || null,
      instagram: "https://www.instagram.com/salwar_butterfly/",
      whatsapp: `https://wa.me/91${settings.shop_phone?.trim()}`,
      banners: slides,
      // The four trust badges the shop configured for its own homepage.
      features: [1, 2, 3, 4]
        .map((n) => ({
          title: settings[`feature${n}_title`]?.trim() || "",
          detail: settings[`feature${n}_desc`]?.trim() || "",
        }))
        .filter((f) => f.title),
    },
    categories: categories
      .filter((c) => live.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name.trim(),
        image: c.image_url || null,
        count: rows.filter((p) => p.category_id === c.id).length,
      }))
      .sort((a, b) => b.count - a.count),
    products: rows,
  };

  await writeFile(OUT, `${JSON.stringify(snapshot, null, 1)}\n`, "utf8");
  console.log(
    `wrote ${path.relative(process.cwd(), OUT)} — ${snapshot.products.length} products, ${snapshot.categories.length} categories`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
