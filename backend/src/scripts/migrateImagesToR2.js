/**
 * Copy every Cloudinary image the database points at into R2, then
 * point the database at the copies:
 *
 *   npm run images:migrate-r2              report only, changes nothing
 *   npm run images:migrate-r2 -- --apply   copy and rewrite
 *
 * Run it once per database — locally, then against production — and
 * again any time: it only ever picks up URLs that still start with
 * res.cloudinary.com, so a second run finds nothing left to do but the
 * images it could not copy the first time.
 *
 * The order is what makes it safe to interrupt:
 *
 *   1. download from Cloudinary, upload to R2 under the same path
 *   2. load each copy back through R2_PUBLIC_URL, as a shopper would
 *   3. only then rewrite the rows, all of them in one transaction
 *
 * A failure in 1 or 2 leaves that image's rows on Cloudinary and the
 * run carries on with the rest. A failure in 3 rolls back every row, and
 * the objects already in R2 are simply overwritten by the next run.
 * Nothing on Cloudinary is ever deleted — closing the account is a
 * separate, deliberate step once the storefront has been checked.
 *
 * An image whose source no longer answers (a disabled account, a file
 * deleted on Cloudinary) cannot be copied and is listed at the end. Its
 * rows keep their old URL, and the storefront's Photo component already
 * draws the illustration in its place.
 *
 * Writes the old → new mapping to r2-migration-<timestamp>.json in the
 * working directory, which is all a rollback would need.
 */

import { writeFile } from "node:fs/promises";

import { pool, closeDb } from "../config/db.js";
import { publicUrlFor, putObject } from "../config/r2.storage.js";
import { detectImageType } from "../utils/imageType.js";

const APPLY = process.argv.includes("--apply");

// How many images move at once. Enough to be quick, few enough that
// neither Cloudinary nor R2 sees it as a burst worth throttling.
const CONCURRENCY = 6;

const TIMEOUT_MS = 30_000;

/**
 * Every column that holds an image URL. `keyColumn` is the handle a
 * later delete needs; order_items has none because an order line's
 * photograph is a snapshot the shop never deletes.
 */
const TARGETS = [
  { table: "categories", urlColumn: "image", keyColumn: "image_public_id" },
  { table: "product_images", urlColumn: "image_url", keyColumn: "image_public_id" },
  { table: "banners", urlColumn: "image", keyColumn: "image_public_id" },
  { table: "customer_stories", urlColumn: "image", keyColumn: "image_public_id" },
  { table: "order_items", urlColumn: "image_url", keyColumn: null },
];

const CLOUDINARY_PREFIX = "https://res.cloudinary.com/";

/**
 * The R2 key for a Cloudinary URL: its path after the version.
 *
 *   https://res.cloudinary.com/dclragtzq/image/upload/v1788072245/products/abc.jpg
 *                                                                 ^^^^^^^^^^^^^^^^
 *
 * Keeping Cloudinary's own folder and name means the key can be traced
 * back to the source by eye. Null for any URL not in that shape —
 * transformed delivery URLs, for one — which is then reported rather
 * than guessed at.
 */
const keyFor = (url) => {
  const match = url.match(/\/image\/upload\/(?:v\d+\/)?([^,]+\.[a-z0-9]+)$/i);
  return match ? match[1] : null;
};

const fetchWithTimeout = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

/** Runs `worker` over `items`, at most CONCURRENCY at a time. */
const eachLimited = async (items, worker) => {
  let next = 0;
  const lanes = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(lanes);
};

/** Distinct Cloudinary URLs across every target, with where each is used. */
const collectUrls = async () => {
  const uses = new Map();

  for (const { table, urlColumn } of TARGETS) {
    const { rows } = await pool.query(
      `SELECT ${urlColumn} AS url, count(*)::int AS n
         FROM ${table}
        WHERE ${urlColumn} LIKE $1
        GROUP BY 1`,
      [`${CLOUDINARY_PREFIX}%`],
    );

    for (const { url, n } of rows) {
      if (!uses.has(url)) uses.set(url, []);
      uses.get(url).push(`${table}×${n}`);
    }
  }

  return uses;
};

/**
 * Copy one image. Resolves to { url, key, newUrl } on success or
 * { url, reason } when it could not be copied.
 */
const copyOne = async (url, key) => {
  if (!key) return { url, reason: "unrecognised URL shape" };

  const source = await fetchWithTimeout(url);

  if (!source.ok) {
    return {
      url,
      reason: `source ${source.status}${source.headers.get("x-cld-error") ? ` (${source.headers.get("x-cld-error")})` : ""}`,
    };
  }

  const body = Buffer.from(await source.arrayBuffer());

  // The bytes decide, as they do for an upload. Cloudinary's header is
  // the fallback for a format the detector does not know.
  const contentType =
    detectImageType(body) ?? source.headers.get("content-type") ?? "application/octet-stream";

  if (!APPLY) return { url, key, newUrl: publicUrlFor(key), bytes: body.length };

  await putObject(key, body, contentType);

  const newUrl = publicUrlFor(key);
  const check = await fetchWithTimeout(newUrl, { method: "HEAD" });

  if (!check.ok) return { url, reason: `copied, but ${newUrl} answered ${check.status}` };

  return { url, key, newUrl, bytes: body.length };
};

/** Point every row at its copy, in one transaction. */
const rewriteRows = async (copied) => {
  const client = await pool.connect();
  const updated = Object.fromEntries(TARGETS.map(({ table }) => [table, 0]));

  try {
    await client.query("BEGIN");

    for (const { url, key, newUrl } of copied) {
      for (const { table, urlColumn, keyColumn } of TARGETS) {
        const { rowCount } = keyColumn
          ? await client.query(
              `UPDATE ${table} SET ${urlColumn} = $2, ${keyColumn} = $3 WHERE ${urlColumn} = $1`,
              [url, newUrl, key],
            )
          : await client.query(
              `UPDATE ${table} SET ${urlColumn} = $2 WHERE ${urlColumn} = $1`,
              [url, newUrl],
            );

        updated[table] += rowCount;
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return updated;
};

const run = async () => {
  console.log(`[r2] ${APPLY ? "APPLY" : "DRY RUN — nothing will change; add --apply to copy"}`);

  const uses = await collectUrls();
  const urls = [...uses.keys()];

  console.log(`[r2] ${urls.length} distinct Cloudinary image(s) referenced`);

  if (urls.length === 0) return;

  // Two URLs that would land on the same key — the same file at two
  // versions — must not overwrite each other. The later one keeps its
  // version in the key.
  const keys = new Map();
  for (const url of urls) {
    let key = keyFor(url);
    if (key && [...keys.values()].includes(key)) {
      key = `${url.match(/\/(v\d+)\//)?.[1] ?? "dup"}/${key}`;
    }
    keys.set(url, key);
  }

  const copied = [];
  const failed = [];

  await eachLimited(urls, async (url) => {
    try {
      const result = await copyOne(url, keys.get(url));
      (result.reason ? failed : copied).push(result);
      process.stdout.write(result.reason ? "x" : ".");
    } catch (error) {
      failed.push({ url, reason: error.message });
      process.stdout.write("x");
    }
  });

  process.stdout.write("\n");

  console.log(`[r2] ${APPLY ? "copied" : "can copy"}: ${copied.length}`);
  console.log(`[r2] cannot copy: ${failed.length}`);

  for (const { url, reason } of failed) {
    console.log(`       ${reason.padEnd(28)} ${url}  [${uses.get(url).join(", ")}]`);
  }

  if (!APPLY || copied.length === 0) return;

  const updated = await rewriteRows(copied);

  console.log(
    `[r2] rows now on R2: ${Object.entries(updated)
      .map(([table, n]) => `${table} ${n}`)
      .join(", ")}`,
  );

  const logPath = `r2-migration-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

  await writeFile(
    logPath,
    JSON.stringify({ copied: copied.map(({ url, key, newUrl }) => ({ url, key, newUrl })), failed }, null, 2),
  );

  console.log(`[r2] mapping written to ${logPath}`);
};

try {
  await run();
} catch (error) {
  console.error("[r2] FAILED — no database rows were changed by the failing step", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
