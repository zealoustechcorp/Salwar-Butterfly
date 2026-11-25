/**
 * One-way data copy: Neon (PostgreSQL) → MariaDB, for the MySQL migration.
 *
 *   npm run db:copy-to-mysql                 # target must be empty
 *   npm run db:copy-to-mysql -- --replace    # wipe the target's rows first
 *
 * Reads DATABASE_URL (Neon, source) and MYSQL_* (target) from backend/.env.
 * The target schema must already exist (src/migrations-mysql/001_baseline.sql).
 *
 * Safety:
 *  - Neon is read inside one READ ONLY, REPEATABLE READ transaction: a single
 *    consistent snapshot, and Postgres itself refuses any write.
 *  - The whole MariaDB side (optional wipe + every insert + sequence) runs in
 *    ONE transaction. Any failure rolls it all back; the target is left as it
 *    was.
 *  - Foreign-key checks stay ON and rows go in parent-first, so every
 *    relationship is re-validated by MariaDB, not assumed.
 *  - The target is never wiped unless --replace is passed. After cutover the
 *    target IS production — do not run with --replace then.
 *  - Afterwards every row is read back and compared field-by-field with the
 *    Neon snapshot; any difference fails the run (exit code 1).
 */
import pg from 'pg';
import mysql from 'mysql2/promise';

const REPLACE = process.argv.includes('--replace');

// Parent tables before children, so inserts satisfy foreign keys as they go.
const TABLES = [
  'categories', 'sub_categories', 'products', 'product_variants', 'product_images',
  'product_attribute_values', 'size_charts',
  'customers', 'customer_addresses', 'admins', 'admin_password_reset_tokens',
  'password_reset_tokens', 'refresh_tokens',
  'orders', 'order_items', 'payments', 'payment_refunds', 'email_messages',
  'wishlist_items', 'reviews',
  'banners', 'customer_stories', 'home_sections', 'home_section_products',
  'recent_order_popup_settings',
];
// schema_migrations is deliberately not copied: its rows name the 45 Postgres
// migration files, which mean nothing to the MariaDB migration runner. The
// target gets one row for its own baseline instead.
const BASELINE = '001_baseline.sql';
const BATCH = 200;

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in backend/.env`);
  return v;
}

// ---------------------------------------------------------------------------
// Value conversion. Postgres values arrive as their raw text output (no
// parsing in the driver), with the session in UTC.
// ---------------------------------------------------------------------------

/** '2026-11-25 06:01:43.284182+00' → '2026-11-25 06:01:43.284182' (UTC). */
function pgTimestamptzToUtc(text) {
  const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2}(?::?\d{2})?)$/.exec(text);
  if (!m) throw new Error(`Unrecognised timestamptz value: ${text}`);
  if (!/^\+00(:?00)?$/.test(m[2])) throw new Error(`Expected UTC offset, got ${text}`);
  return m[1];
}

function toMysql(value, udt) {
  if (value === null) return null;
  switch (udt) {
    case 'bool': return value === 't' ? 1 : 0;
    case 'timestamptz': return pgTimestamptzToUtc(value);
    case 'bpchar': return value.replace(/ +$/, ''); // CHAR padding; MariaDB strips it too
    default: return value; // uuid, varchar, text, numeric, int, jsonb, inet, timestamp
  }
}

// ---------------------------------------------------------------------------
// Canonical form used by the field-by-field comparison.
// ---------------------------------------------------------------------------

function canonicalJson(text) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
      : v);
  return JSON.stringify(sort(JSON.parse(text)));
}

function canonicalTimestamp(text) {
  // Both sides as 'YYYY-MM-DD HH:MM:SS.ffffff'.
  const [base, frac = ''] = text.split('.');
  return `${base}.${frac.padEnd(6, '0')}`;
}

function canonical(value, udt, side) {
  if (value === null || value === undefined) return null;
  switch (udt) {
    case 'bool': return side === 'pg' ? (value === 't' ? '1' : '0') : String(Number(value));
    case 'timestamptz': return canonicalTimestamp(side === 'pg' ? pgTimestamptzToUtc(value) : String(value));
    case 'timestamp': return canonicalTimestamp(String(value));
    case 'jsonb': return canonicalJson(String(value));
    case 'bpchar': return String(value).replace(/ +$/, '');
    default: return String(value);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const neonUrl = new URL(required('DATABASE_URL'));
  neonUrl.searchParams.delete('sslmode');
  const source = new pg.Client({
    connectionString: neonUrl.toString(),
    ssl: { rejectUnauthorized: true },
    types: { getTypeParser: () => (v) => v }, // keep Postgres's own text output
  });

  const target = await mysql.createConnection({
    host: required('MYSQL_HOST'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    database: required('MYSQL_DATABASE'),
    timezone: 'Z',
    dateStrings: true, // read DATETIMEs back as plain strings for comparison
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  console.log(`[copy] source: Neon ${neonUrl.hostname}${neonUrl.pathname}`);
  console.log(`[copy] target: MariaDB ${process.env.MYSQL_HOST}/${process.env.MYSQL_DATABASE}`);

  await source.connect();
  try {
    // UTC, strict (reject rather than truncate/coerce bad values).
    await target.query("SET time_zone = '+00:00'");
    await target.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    await target.query('SET FOREIGN_KEY_CHECKS = 1');

    // ---- Target pre-flight ------------------------------------------------
    const [targetTables] = await target.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );
    const present = new Set(targetTables.map((r) => r.t));
    const missing = [...TABLES, 'schema_migrations'].filter((t) => !present.has(t));
    if (missing.length) throw new Error(`Target schema incomplete, missing: ${missing.join(', ')}. Apply 001_baseline.sql first.`);

    const nonEmpty = [];
    for (const t of TABLES) {
      const [[{ n }]] = await target.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      if (Number(n) > 0) nonEmpty.push(`${t}(${n})`);
    }
    if (nonEmpty.length && !REPLACE) {
      throw new Error(`Target already has data: ${nonEmpty.join(', ')}. Re-run with --replace to wipe it first.`);
    }

    // ---- Source snapshot -------------------------------------------------
    await source.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await source.query("SET LOCAL TIME ZONE 'UTC'");

    const { rows: colRows } = await source.query(`
      SELECT table_name, column_name, udt_name, is_generated
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`);
    const pgCols = {};
    for (const r of colRows) (pgCols[r.table_name] ??= []).push(r);

    const { rows: pkRows } = await source.query(`
      SELECT c.conrelid::regclass::text AS table_name, array_to_json(array_agg(a.attname ORDER BY k.ord))::text AS cols
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      WHERE c.contype = 'p' AND c.connamespace = 'public'::regnamespace
      GROUP BY 1`);
    const pk = Object.fromEntries(pkRows.map((r) => [r.table_name, JSON.parse(r.cols)]));

    const snapshot = {};
    for (const t of TABLES) {
      if (!pgCols[t]) throw new Error(`Source table ${t} not found in Neon`);
      const order = pk[t].map((c) => `"${c}"`).join(', ');
      snapshot[t] = (await source.query(`SELECT * FROM "${t}" ORDER BY ${order}`)).rows;
    }
    const { rows: [seq] } = await source.query('SELECT last_value, is_called FROM orders_number_seq');
    await source.query('COMMIT');

    // Target column metadata: skip generated columns on insert.
    const [myColRows] = await target.query(`
      SELECT table_name AS t, column_name AS c, extra AS x
      FROM information_schema.columns WHERE table_schema = DATABASE()`);
    const myCols = {};
    for (const r of myColRows) (myCols[r.t] ??= new Map()).set(r.c, r.x);

    // ---- Copy, in one target transaction ----------------------------------
    await target.beginTransaction();
    try {
      if (REPLACE) {
        for (const t of [...TABLES].reverse()) await target.query(`DELETE FROM \`${t}\``);
        await target.query('DELETE FROM schema_migrations');
        console.log('[copy] --replace: target rows deleted (inside the transaction)');
      }

      for (const t of TABLES) {
        const cols = pgCols[t].filter((c) => c.is_generated === 'NEVER');
        for (const c of cols) {
          const extra = myCols[t]?.get(c.column_name);
          if (extra === undefined) throw new Error(`Column ${t}.${c.column_name} missing in target`);
          if (/GENERATED/i.test(extra)) throw new Error(`Column ${t}.${c.column_name} is generated in target but not in source`);
        }
        const rows = snapshot[t];
        const colList = cols.map((c) => `\`${c.column_name}\``).join(', ');
        for (let i = 0; i < rows.length; i += BATCH) {
          const values = rows.slice(i, i + BATCH).map((r) => cols.map((c) => toMysql(r[c.column_name], c.udt_name)));
          await target.query(`INSERT INTO \`${t}\` (${colList}) VALUES ?`, [values]);
        }
        console.log(`[copy] ${t.padEnd(30)} ${String(rows.length).padStart(5)} rows`);
      }

      await target.query('INSERT INTO schema_migrations (filename) VALUES (?)', [BASELINE]);

      await target.commit();
      console.log('[copy] committed');
    } catch (err) {
      await target.rollback().catch(() => {});
      throw new Error(`Copy rolled back, target unchanged: ${err.message}`);
    }

    // Order numbers continue exactly where Neon left off. RESTART rather than
    // SETVAL: SETVAL never moves a MariaDB sequence backwards, and the target's
    // sequence may have run ahead (sequences ignore rollback, so tests against
    // the staging copy consume numbers). RESTART is DDL — it commits on its
    // own — which is why it runs after the data transaction, not inside it.
    const nextOrderNumber = seq.is_called === 't' ? Number(seq.last_value) + 1 : Number(seq.last_value);
    await target.query(`ALTER SEQUENCE orders_number_seq RESTART WITH ${nextOrderNumber}`);
    console.log(`[copy] orders_number_seq restarted at ${nextOrderNumber} (Neon last_value=${seq.last_value}, is_called=${seq.is_called})`);

    // ---- Verify: every row, every field -----------------------------------
    let differences = 0;
    for (const t of TABLES) {
      const cols = pgCols[t]; // includes generated columns: their computed values are checked too
      const keyOf = (r) => pk[t].map((c) => String(r[c])).join('|');
      const [myRows] = await target.query(`SELECT ${cols.map((c) => `\`${c.column_name}\``).join(', ')} FROM \`${t}\``);
      const mine = new Map(myRows.map((r) => [keyOf(r), r]));
      if (myRows.length !== snapshot[t].length) {
        console.error(`[verify] ${t}: row count Neon ${snapshot[t].length} ≠ MariaDB ${myRows.length}`);
        differences += 1;
      }
      for (const src of snapshot[t]) {
        const dst = mine.get(keyOf(src));
        if (!dst) { console.error(`[verify] ${t} ${keyOf(src)}: missing in MariaDB`); differences += 1; continue; }
        for (const c of cols) {
          const a = canonical(src[c.column_name], c.udt_name, 'pg');
          const b = canonical(dst[c.column_name], c.udt_name, 'my');
          if (a !== b) {
            differences += 1;
            if (differences <= 20) console.error(`[verify] ${t} ${keyOf(src)} .${c.column_name}: Neon ${JSON.stringify(a)} ≠ MariaDB ${JSON.stringify(b)}`);
          }
        }
      }
    }
    // Read without consuming: with NOCACHE, next_not_cached_value is exactly
    // what the next NEXTVAL will return. (Calling NEXTVAL to peek would burn a
    // number — MariaDB's SETVAL cannot move a sequence backwards.)
    const [[{ nextval }]] = await target.query('SELECT next_not_cached_value AS nextval FROM orders_number_seq');

    if (Number(nextval) !== nextOrderNumber) {
      console.error(`[verify] orders_number_seq: next value ${nextval}, expected ${nextOrderNumber}`);
      differences += 1;
    }

    const total = TABLES.reduce((n, t) => n + snapshot[t].length, 0);
    if (differences) {
      console.error(`[verify] FAILED: ${differences} difference(s) across ${total} rows`);
      process.exitCode = 1;
    } else {
      console.log(`[verify] OK: ${TABLES.length} tables, ${total} rows, every field identical. Next order number: ${nextval}`);
    }
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[copy] FAILED:', err.message);
  process.exitCode = 1;
});
