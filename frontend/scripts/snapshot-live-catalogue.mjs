/**
 * Snapshots the live salwarbutterfly.in catalogue into a static JSON file.
 *
 *   node scripts/snapshot-live-catalogue.mjs
 *
 * The storefront is deliberately frontend-only — it must render with no API and
 * no database — so the live shop's data is pulled once, trimmed to the fields
 * the storefront actually uses, and committed as
 * `src/lib/store/live-catalogue.json`. Re-run this whenever the real shop's
 * stock moves; nothing at runtime ever calls the API.
 *
 * Source: the React SPA at https://www.salwarbutterfly.in reads this same API.
 * Product photography stays on the shop's own Cloudinary account — the snapshot
 * stores URLs, not bytes.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const API = "https://swalar-butterfly.onrender.com/api";
const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "lib",
  "store",
  "live-catalogue.json",
);

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
