/**
 * Load the shop's real catalogue into Postgres (F-06):
 *
 *   npm run db:import-catalogue
 *
 * Where this data comes from, and why this script exists.
 *
 * The storefront has been rendering from a committed snapshot of the
 * *old* shop's API — `frontend/src/lib/store/live-catalogue.json`, 197
 * real products with integer ids. This database, meanwhile, held a
 * handful of admin test rows. Two catalogues, no mapping between them.
 *
 * That was survivable while the storefront only had to display things.
 * Checkout ends it: an order line points at a `product_variants.id`,
 * and a product that exists only in a JSON file has no such row. So the
 * real catalogue has to live here.
 *
 * Idempotent, by slug. Running it twice updates rather than duplicates,
 * which is what makes it safe to re-run after the shop's stock moves.
 * It never deletes: a product withdrawn upstream is deactivated, not
 * removed, because an order may point at it.
 *
 * Test rows already in the database are left alone. They have their own
 * slugs and this script only touches what it can match.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { pool, closeDb } from "../config/db.js";

const DEFAULT_SNAPSHOT = path.join(
  fileURLToPath(new URL("../../../", import.meta.url)),
  "frontend",
  "src",
  "lib",
  "store",
  "live-catalogue.json",
);

const snapshotPath = process.argv[2] ?? DEFAULT_SNAPSHOT;

/**
 * A URL-safe slug.
 *
 * The snapshot's names repeat heavily — the shop has a dozen products
 * literally called "Anarkali salwar" — so the upstream id is appended.
 * That keeps the slug unique without inventing a counter, and makes a
 * re-run match the same row it created last time.
 */
const slugify = (name, id) =>
  `${String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "product"}-${id}`;

/**
 * Cloudinary stores an id inside the delivery URL:
 *
 *   .../upload/v1784379523/shop/products/qlahqn4cimw3q65zdt1x.jpg
 *                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *
 * `product_images.image_public_id` is NOT NULL and is what a future
 * delete would need, so it is recovered here rather than left blank.
 * Falls back to the URL itself when the shape is unfamiliar — a
 * placeholder is better than refusing to import the photo.
 */
const publicIdFrom = (url) => {
  const match = String(url).match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i);
  return match ? match[1] : String(url);
};

const round2 = (value) => Math.round(Number(value) * 100) / 100;

const run = async () => {
  const raw = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(raw);

  const categories = snapshot.categories ?? [];
  const products = snapshot.products ?? [];

  console.log(`[import] ${path.basename(snapshotPath)}`);
  console.log(`[import] ${categories.length} categories, ${products.length} products`);

  const client = await pool.connect();

  const counts = {
    categories: 0,
    products: 0,
    variants: 0,
    images: 0,
    deactivated: 0,
  };

  try {
    // One transaction for the whole import. A half-loaded catalogue is
    // worse than none: the storefront would render products whose
    // sizes had not arrived yet, and every one of them would fail at
    // checkout with "no longer in the shop".
    await client.query("BEGIN");

    // ----------------------------------------------------------
    // CATEGORIES
    // ----------------------------------------------------------
    //
    // ON CONFLICT against the partial unique index the schema already
    // has — `categories_slug_unique WHERE deleted_at IS NULL`. Naming
    // the index's predicate is what lets Postgres match it.

    const categoryIdBySourceId = new Map();

    for (const category of categories) {
      const slug = slugify(category.name, category.id);

      const result = await client.query(
        `INSERT INTO categories (name, slug, image, active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (slug) WHERE deleted_at IS NULL
         DO UPDATE SET
           name       = EXCLUDED.name,
           image      = COALESCE(EXCLUDED.image, categories.image),
           active     = TRUE,
           updated_at = NOW()
         RETURNING id`,
        [String(category.name).trim(), slug, category.image ?? null],
      );

      categoryIdBySourceId.set(category.id, result.rows[0].id);
      counts.categories += 1;
    }

    // ----------------------------------------------------------
    // PRODUCTS, VARIANTS AND PHOTOS
    // ----------------------------------------------------------

    const importedSlugs = [];

    for (const product of products) {
      const categoryId = categoryIdBySourceId.get(product.category_id);

      // A product whose category did not come through has nowhere to
      // live — category_id is NOT NULL. Skipped rather than guessed at.
      if (!categoryId) {
        console.warn(
          `[import] skipped "${product.name}" — unknown category ${product.category_id}`,
        );
        continue;
      }

      const slug = slugify(product.name, product.id);
      importedSlugs.push(slug);

      // The snapshot carries the selling price and, where there is a
      // discount, the struck-through original. This schema is the other
      // way round: a base price and a percentage off it. So `mrp` is
      // the base where one exists, and the percentage is recomputed
      // rather than copied — the snapshot's `off` is rounded for
      // display and would not reproduce the price exactly.
      const price = round2(product.price);
      const basePrice = product.mrp ? round2(product.mrp) : price;
      const discount =
        basePrice > price ? round2((1 - price / basePrice) * 100) : 0;

      const result = await client.query(
        `INSERT INTO products (
           category_id, name, slug, base_price,
           discount_percentage, current_price, active
         )
         VALUES ($1::uuid, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (slug) DO UPDATE SET
           category_id         = EXCLUDED.category_id,
           name                = EXCLUDED.name,
           base_price          = EXCLUDED.base_price,
           discount_percentage = EXCLUDED.discount_percentage,
           current_price       = EXCLUDED.current_price,
           active              = TRUE,
           updated_at          = NOW()
         RETURNING id`,
        [categoryId, String(product.name).trim(), slug, basePrice, discount, price],
      );

      const productId = result.rows[0].id;
      counts.products += 1;

      // --- sizes ---------------------------------------------------
      //
      // `position` keeps the shop's own ordering — 36, 38, 40 rather
      // than whatever a text sort makes of them.
      //
      // Stock is NOT overwritten on a re-run. This database is the
      // record now: an order placed here has already decremented a
      // size, and re-importing an older snapshot would undo that and
      // put sold pieces back on the shelf.

      const sizes = Array.isArray(product.sizes) ? product.sizes : [];

      for (const [position, size] of sizes.entries()) {
        await client.query(
          `INSERT INTO product_variants (product_id, size, stock_quantity, position, active)
           VALUES ($1::uuid, $2, $3, $4, TRUE)
           ON CONFLICT (product_id, size) DO UPDATE SET
             position   = EXCLUDED.position,
             active     = TRUE,
             updated_at = NOW()
           RETURNING id`,
          [productId, String(size.size).trim(), Number(size.stock) || 0, position],
        );

        counts.variants += 1;
      }

      // --- photos --------------------------------------------------
      //
      // The bytes stay on the shop's own Cloudinary account; only the
      // URL is stored, which is what product_images has always held.

      const photos = [product.image, product.image2].filter(Boolean);

      for (const [position, url] of photos.entries()) {
        const inserted = await client.query(
          `INSERT INTO product_images (product_id, image_url, image_public_id, alt_text, position)
           SELECT $1::uuid, $2, $3, $4, $5
           WHERE NOT EXISTS (
             SELECT 1 FROM product_images
             WHERE product_id = $1::uuid AND image_url = $2
           )`,
          [productId, url, publicIdFrom(url), String(product.name).trim(), position],
        );

        counts.images += inserted.rowCount;
      }
    }

    // ----------------------------------------------------------
    // WITHDRAWN PRODUCTS
    // ----------------------------------------------------------
    //
    // Anything previously imported that is no longer in the snapshot
    // has been taken off the upstream shop. Deactivated, never deleted:
    // an order line may point at it, and the receipt has to keep
    // working. Matched by the `-<upstream id>` slug suffix so the
    // admin's own test products are not caught by it.

    const withdrawn = await client.query(
      `UPDATE products
       SET active = FALSE, updated_at = NOW()
       WHERE slug ~ '-[0-9]+$'
         AND slug <> ALL($1::text[])
         AND active = TRUE
       RETURNING slug`,
      [importedSlugs],
    );

    counts.deactivated = withdrawn.rowCount;

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("[import] FAILED — nothing was written");
    console.error(`         ${error.message}`);

    throw error;
  } finally {
    client.release();
  }

  console.log(
    `[import] OK — ${counts.categories} categories, ${counts.products} products, ` +
      `${counts.variants} sizes, ${counts.images} new photos` +
      (counts.deactivated ? `, ${counts.deactivated} withdrawn` : ""),
  );
  console.log("[import] next: npm run db:export-storefront");
};

try {
  await run();
} catch {
  process.exitCode = 1;
} finally {
  await closeDb();
}
