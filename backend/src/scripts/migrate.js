/**
 * Apply every SQL file in src/migrations-mysql, in filename order:
 *
 *   npm run db:migrate
 *
 * Tracks what it has already run in `schema_migrations` (created by
 * 001_baseline.sql itself). src/migrations holds the Postgres history up to
 * the move to MariaDB and is no longer applied.
 *
 * Two differences from the Postgres runner, both MariaDB's:
 *
 *  - DDL is not transactional. CREATE/ALTER/DROP commit as they run, so a
 *    file that fails halfway leaves its earlier statements applied and is
 *    NOT recorded. Fix the file (or the database) and run again; write
 *    migrations so that re-running them is safe (IF NOT EXISTS / IF EXISTS).
 *
 *  - A migration file holds several statements, which the application's
 *    pool deliberately refuses (multipleStatements is off there, as a guard
 *    against SQL injection). This runner opens its own connection with it on.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import mysql from "mysql2/promise";

import { env } from "../config/env.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations-mysql/", import.meta.url));

const run = async () => {
  const conn = await mysql.createConnection({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    ssl: env.mysqlSsl
      ? env.mysqlCaCert
        ? { rejectUnauthorized: true, ca: env.mysqlCaCert }
        : { rejectUnauthorized: true }
      : undefined,
    charset: "utf8mb4",
    timezone: "Z",
    multipleStatements: true,
  });

  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(
      "SET SESSION sql_mode = 'STRICT_ALL_TABLES,ANSI_QUOTES,PIPES_AS_CONCAT,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );

    const [tracking] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'",
    );

    const done = new Set();
    if (Number(tracking[0].n) > 0) {
      const [rows] = await conn.query("SELECT filename FROM schema_migrations");
      for (const row of rows) done.add(row.filename);
    }

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
        await conn.query(sql);
        await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [filename]);

        console.log(`[db:migrate] applied ${filename}`);
        ran += 1;
      } catch (error) {
        console.error(`[db:migrate] FAILED  ${filename}`);
        console.error(`             ${error.message}`);
        console.error(
          "             MariaDB DDL is not transactional: statements before the failure may have been applied.",
        );

        throw error;
      }
    }

    console.log(
      ran === 0
        ? "[db:migrate] already up to date"
        : `[db:migrate] OK — ${ran} migration(s) applied`,
    );
  } finally {
    await conn.end();
  }
};

try {
  await run();
} catch {
  process.exitCode = 1;
}
