/**
 * Write the storefront's catalogue snapshot from this database (F-06):
 *
 *   npm run db:export-storefront
 *
 * The storefront is deliberately frontend-only — it renders 197 static
 * pages at build time with no fetch and no spinner, and that is worth
 * keeping. So rather than making it call the API at runtime, this
 * dumps what the API would say into
 * `frontend/src/lib/store/live-catalogue.json`.
 *
 * What changes from the old snapshot, and why it matters:
 *
 *   ids are UUIDs      They are this database's ids now, not the old
 *                      shop's integers, so a page can point at a row
 *                      that actually exists here.
 *
 *   sizes carry a      This is the whole point. A bag line needs a
 *   variant_id         product_variants.id to check out with; a size
 *                      label alone cannot be ordered.
 *
 * The `shop` block — logo, banners, contact, trust badges — is carried
 * over from the existing file untouched. It comes from the old shop's
 * settings endpoint and has no table here; overwriting it with nothing
 * would strip the storefront's branding.
 *
 * Run after `npm run db:import-catalogue`, or any time the shop's stock
 * moves in the admin panel.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { query, closeDb } from "../config/db.js";

const OUT = path.join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "frontend",
  "src",
  "lib",
  "store",
  "live-catalogue.json",
);

const outPath = process.argv[2] ?? OUT;

const num = (value) => (value === null || value === undefined ? null : Number(value));

/** Percentage off, rounded — what the badge on a card shows. */
const discountPercent = (price, mrp) => {
  if (!mrp || mrp <= price) return 0;
  return Math.round((1 - price / mrp) * 100);
};

const run = async () => {
  // The shop block has no table here. Read it back off the file we are
  // about to replace, so the storefront keeps its branding.
  let shop = null;

  try {
    const existing = JSON.parse(await readFile(outPath, "utf8"));
    shop = existing.shop ?? null;
  } catch {
    console.warn("[export] no existing snapshot — the `shop` block will be empty");
  }

  // ----------------------------------------------------------
  // CATEGORIES
  // ----------------------------------------------------------
  //
  // Fetched whole and filtered below, against the products that
  // actually made it into the snapshot. Counting in SQL would count
  // rows this export then drops for having no photo, and a tile
  // promising seventeen pieces that opens on an empty grid is worse
  // than no tile.

  const categories = await query(`
    SELECT c.id, c.name, c.image
    FROM categories c
    WHERE c.deleted_at IS NULL
      AND c.active = TRUE
    ORDER BY c.name ASC
  `);

  // ----------------------------------------------------------
  // PRODUCTS
  // ----------------------------------------------------------
  //
  // Sizes and photos come back as JSON arrays from LATERALs rather
  // than as a join that multiplies rows — a product with six sizes and
  // two photos would otherwise arrive twelve times and have to be
  // reassembled in JavaScript.
  //
  // `stock` is the product-level total the cards use for "only N
  // left"; the per-size counts underneath are what the size chips read.

  const products = await query(`
    SELECT
      p.id,
      p.name,
      p.current_price,
      p.base_price,
      p.category_id,
      p.created_at,
      COALESCE(sizes.rows, '[]'::json) AS sizes,
      COALESCE(sizes.total_stock, 0)   AS stock,
      photos.image_url                 AS image,
      photos.image_url_2               AS image2
    FROM products p
    LEFT JOIN LATERAL (
      SELECT
        json_agg(
          json_build_object(
            'variant_id', v.id,
            'size',       v.size,
            'stock',      v.stock_quantity
          )
          ORDER BY v.position ASC, v.size ASC
        ) AS rows,
        SUM(v.stock_quantity)::INTEGER AS total_stock
      FROM product_variants v
      WHERE v.product_id = p.id
        AND v.active = TRUE
    ) sizes ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        MAX(i.image_url) FILTER (WHERE i.rn = 1) AS image_url,
        MAX(i.image_url) FILTER (WHERE i.rn = 2) AS image_url_2
      FROM (
        SELECT
          pi.image_url,
          ROW_NUMBER() OVER (ORDER BY pi.position ASC, pi.created_at ASC) AS rn
        FROM product_images pi
        WHERE pi.product_id = p.id
      ) i
    ) photos ON TRUE
    WHERE p.active = TRUE
    ORDER BY p.created_at DESC, p.id DESC
  `);

  // A product with no photo cannot be rendered as a card — the grid is
  // photography first. Dropped here rather than shipped as a grey box.
  const rows = products.rows.filter((row) => Boolean(row.image));
  const withoutPhoto = products.rows.length - rows.length;

  // How many shippable products each category ended up with — the
  // number the tile shows, and the test for whether it gets one.
  const countByCategory = new Map();

  for (const row of rows) {
    countByCategory.set(
      row.category_id,
      (countByCategory.get(row.category_id) ?? 0) + 1,
    );
  }

  const snapshot = {
    fetched_at: new Date().toISOString().slice(0, 10),
    source: "salwar-butterfly API",
    shop,

    categories: categories.rows
      .filter((row) => countByCategory.get(row.id) > 0)
      .map((row) => ({
        id: row.id,
        name: row.name,
        image: row.image,
        count: countByCategory.get(row.id),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),

    products: rows.map((row) => {
      const price = num(row.current_price);
      const base = num(row.base_price);
      // Only a base price above what is being charged is an "was ₹X"
      // worth striking through. Equal prices mean no discount, and
      // rendering "was ₹1850" beside "₹1850" reads as a mistake.
      const mrp = base && base > price ? base : null;

      return {
        id: row.id,
        name: row.name,
        price,
        mrp,
        off: discountPercent(price, mrp),
        category_id: row.category_id,
        image: row.image,
        image2: row.image2 ?? null,
        stock: Number(row.stock) || 0,
        sizes: (row.sizes ?? []).map((size) => ({
          // The id a bag line carries and checkout orders against.
          variant_id: size.variant_id,
          size: size.size,
          stock: Number(size.stock) || 0,
        })),
        created_at: row.created_at,
      };
    }),
  };

  await writeFile(outPath, `${JSON.stringify(snapshot, null, 1)}\n`, "utf8");

  const sizeCount = snapshot.products.reduce((sum, p) => sum + p.sizes.length, 0);

  console.log(`[export] ${path.relative(process.cwd(), outPath)}`);
  console.log(
    `[export] OK — ${snapshot.categories.length} categories, ` +
      `${snapshot.products.length} products, ${sizeCount} sizes`,
  );

  if (withoutPhoto) {
    console.warn(`[export] ${withoutPhoto} active product(s) skipped — no photo`);
  }

  if (!shop) {
    console.warn("[export] the `shop` block is null — the storefront will render unbranded");
  }
};

try {
  await run();
} catch (error) {
  console.error("[export] FAILED");
  console.error(`         ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
