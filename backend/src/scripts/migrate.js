/**
 * Apply every SQL file in src/migrations, in filename order:
 *
 *   npm run db:migrate
 *
 * This project had no migration runner — the .sql files were applied
 * by hand. This is deliberately the smallest thing that works: it
 * tracks what it has already run in a `schema_migrations` table, and
 * wraps each file in a transaction so a failure leaves nothing half
 * applied.
 *
 * Every existing migration is written with IF NOT EXISTS, so running
 * this against a database that was set up by hand is safe.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { pool, closeDb } from "../config/db.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

const TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const run = async () => {
  const client = await pool.connect();

  try {
    await client.query(TRACKING_TABLE);

    const applied = await client.query("SELECT filename FROM schema_migrations");

    const done = new Set(applied.rows.map((row) => row.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[db:migrate] no .sql files found");
      return;
    }

    let ran = 0;

    for (const filename of files) {
      if (done.has(filename)) {
        console.log(`[db:migrate] skip    ${filename}`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, filename), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");

        console.log(`[db:migrate] applied ${filename}`);
        ran += 1;
      } catch (error) {
        await client.query("ROLLBACK");

        console.error(`[db:migrate] FAILED  ${filename}`);
        console.error(`             ${error.message}`);

        throw error;
      }
    }

    console.log(
      ran === 0
        ? "[db:migrate] already up to date"
        : `[db:migrate] OK — ${ran} migration(s) applied`,
    );
  } finally {
    client.release();
  }
};

try {
  await run();
} catch {
  process.exitCode = 1;
} finally {
  await closeDb();
}
