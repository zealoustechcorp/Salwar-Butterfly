import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import { env } from './env.js';

/**
 * MariaDB access layer.
 *
 * The application was written against node-postgres (`pg`). Rather than touch
 * every service, this module keeps pg's *contract* and speaks MariaDB
 * underneath:
 *
 *  - `query(text, params)` and `client.query(...)` accept Postgres-style `$1,
 *    $2 …` placeholders (a `$n` may repeat) and resolve to `{ rows, rowCount }`.
 *    rowCount is rows returned for a SELECT/RETURNING and rows *matched* for a
 *    write (the FOUND_ROWS flag — not MariaDB's "rows changed").
 *  - Errors carry pg's fields: `code` (the Postgres SQLSTATE: 23505, 23503,
 *    23514, 23502, 40P01 …), `constraint`, `detail`, `table`, `column`. The
 *    services branch on those; the schema keeps every Postgres constraint name.
 *    The MariaDB originals stay on `err.mysqlCode` / `err.errno`.
 *  - Values: DECIMAL as strings (as pg's numeric), BOOLEAN columns as
 *    true/false, DATETIME as Date (UTC), JSON columns parsed. BIGINT —
 *    including COUNT(*) and CAST(… AS SIGNED) — as a JS number (a string only
 *    beyond 2^53). pg returned int8 as a string; a number is the safer side of
 *    that difference, since Number()/parseInt() accept both but `=== 0` and
 *    `+` do not. SUM() of an integer column is DECIMAL in MariaDB — a string —
 *    so wrap it in CAST(… AS SIGNED) where a number is wanted.
 *
 * Every connection runs in UTC, READ COMMITTED (Postgres's default isolation),
 * strict mode (reject bad data instead of truncating it — the Hostinger server
 * default is NOT strict), ANSI_QUOTES ("ident" is an identifier, as in
 * Postgres) and PIPES_AS_CONCAT (|| concatenates, as in Postgres).
 *
 * Computed values whose type MariaDB cannot report:
 *  - alias ending `__bool`  → converted to true/false, suffix dropped
 *  - alias ending `__json`  → JSON.parse'd, suffix dropped
 *  e.g. `SELECT EXISTS(...) AS in_stock__bool` yields `row.in_stock === true`.
 *
 * Parameters: a JS array expands to a list, for `col IN ($1)`. An empty array
 * becomes NULL, so `IN ($1)` matches nothing, as `= ANY('{}')` did. A plain
 * object is sent as JSON text. Pass JSON *arrays* as JSON.stringify(...) —
 * a bare array means a list.
 */

const SESSION_SQL = [
  "SET time_zone = '+00:00'",
  'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,ANSI_QUOTES,PIPES_AS_CONCAT,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
];

/** Real JSON columns (MariaDB stores JSON as LONGTEXT and reports it as such). */
const JSON_COLUMNS = new Set([
  'categories.fits',
  'products.attributes',
  'size_charts.column_keys',
  'size_charts.measurements',
]);

function typeCast(field, next) {
  // BOOLEAN is TINYINT(1).
  if (field.type === 'TINY' && field.length === 1) {
    const v = field.string();
    return v === null ? null : v === '1';
  }
  return next();
}

/**
 * Result keys holding a real JSON column. The typeCast hook does not see a
 * column's original table, but the field list does (`orgTable`/`orgName`
 * survive table aliases like `products p`).
 */
function jsonKeys(fields) {
  if (!fields) return [];
  return fields
    .filter((f) => f.orgTable && JSON_COLUMNS.has(`${f.orgTable}.${f.orgName}`))
    .map((f) => f.name);
}

function sslConfig() {
  if (!env.mysqlSsl) return undefined;
  return env.mysqlCaCert ? { rejectUnauthorized: true, ca: env.mysqlCaCert } : { rejectUnauthorized: true };
}

const mysqlPool = mysql.createPool({
  host: env.mysqlHost,
  port: env.mysqlPort,
  user: env.mysqlUser,
  password: env.mysqlPassword,
  database: env.mysqlDatabase,
  ssl: sslConfig(),
  charset: 'utf8mb4',
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: false, // BIGINT / COUNT(*) as numbers (strings only past 2^53)
  decimalNumbers: false, // DECIMAL as strings, like pg's numeric
  typeCast,
  connectionLimit: env.mysqlPoolSize,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10_000,
  idleTimeout: 30_000,
  enableKeepAlive: true,
});

// Runs once per physical connection, queued ahead of any application query.
mysqlPool.pool.on('connection', (conn) => {
  for (const sql of SESSION_SQL) {
    conn.query(sql, (err) => {
      if (err) console.error('[db] session setup failed:', err.message);
    });
  }
});

// ---------------------------------------------------------------------------
// $n placeholders → ?
// ---------------------------------------------------------------------------

const translated = new Map();
const TRANSLATION_CACHE_MAX = 2000;

/**
 * Rewrites `$1 … $n` outside string literals, quoted identifiers and comments
 * into `?`, returning the SQL and the parameter order (1-based indexes, a
 * repeated `$n` appears twice).
 */
function translatePlaceholders(text) {
  const cached = translated.get(text);
  if (cached) return cached;

  let out = '';
  const order = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\' && ch === "'") { j += 2; continue; }
        if (text[j] === ch) {
          if (text[j + 1] === ch) { j += 2; continue; } // doubled quote
          break;
        }
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '-' && text[i + 1] === '-') {
      const j = text.indexOf('\n', i);
      const end = j === -1 ? n : j;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      const end = j === -1 ? n : j + 2;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '$' && /[0-9]/.test(text[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(text[j])) j += 1;
      order.push(Number(text.slice(i + 1, j)));
      out += '?';
      i = j;
      continue;
    }
    out += ch;
    i += 1;
  }

  const result = { sql: out, order };
  if (translated.size >= TRANSLATION_CACHE_MAX) translated.clear();
  translated.set(text, result);
  return result;
}

function toDriverValue(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value;
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function bindParams(text, params) {
  const { sql, order } = translatePlaceholders(text);
  if (order.length === 0) return { sql, values: [] };
  const values = order.map((index) => {
    if (index < 1 || index > params.length) {
      throw new Error(`Query uses $${index} but only ${params.length} parameter(s) were given`);
    }
    return toDriverValue(params[index - 1]);
  });
  return { sql, values };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function convertRow(row) {
  let out = row;
  for (const key of Object.keys(row)) {
    let target;
    let value = row[key];
    if (key.endsWith('__bool')) {
      target = key.slice(0, -6);
      value = value === null || value === undefined ? null : Boolean(Number(value));
    } else if (key.endsWith('__json')) {
      target = key.slice(0, -6);
      value = value === null || value === undefined ? null : typeof value === 'string' ? JSON.parse(value) : value;
    } else {
      continue;
    }
    if (out === row) out = { ...row };
    delete out[key];
    out[target] = value;
  }
  return out;
}

function toPgResult([result, fields]) {
  if (Array.isArray(result)) {
    const json = jsonKeys(fields);
    if (json.length) {
      for (const row of result) {
        for (const key of json) {
          if (typeof row[key] === 'string') row[key] = JSON.parse(row[key]);
        }
      }
    }
    const rows = result.map(convertRow);
    return { rows, rowCount: rows.length, fields };
  }
  return { rows: [], rowCount: result.affectedRows, insertId: result.insertId, fields: [] };
}

// ---------------------------------------------------------------------------
// Errors → Postgres shape
// ---------------------------------------------------------------------------

/** Hidden helper columns standing in for Postgres partial/expression indexes. */
const HELPER_COLUMN_SOURCE = {
  slug_live: 'slug',
  email_live: 'email',
  phone_live: 'phone',
  value_lower: 'value',
  default_customer_id: 'customer_id',
};

const keyColumnsCache = new Map();

async function keyColumns(table, key) {
  const cacheKey = `${table}.${key}`;
  if (keyColumnsCache.has(cacheKey)) return keyColumnsCache.get(cacheKey);
  try {
    const [rows] = await mysqlPool.query(
      `SELECT table_name AS t, column_name AS c FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND index_name = ? ${table ? 'AND table_name = ?' : ''}
       ORDER BY seq_in_index`,
      table ? [key, table] : [key],
    );
    const result = {
      table: rows[0]?.t ?? table ?? undefined,
      columns: rows.map((r) => HELPER_COLUMN_SOURCE[r.c] ?? r.c),
    };
    keyColumnsCache.set(cacheKey, result);
    return result;
  } catch {
    return { table, columns: [] };
  }
}

const SQLSTATE_BY_ERRNO = {
  1062: '23505', // ER_DUP_ENTRY                → unique_violation
  1586: '23505', // ER_DUP_ENTRY_WITH_KEY_NAME
  1451: '23503', // ER_ROW_IS_REFERENCED_2      → foreign_key_violation
  1452: '23503', // ER_NO_REFERENCED_ROW_2
  4025: '23514', // ER_CONSTRAINT_FAILED        → check_violation
  1048: '23502', // ER_BAD_NULL_ERROR           → not_null_violation
  1364: '23502', // ER_NO_DEFAULT_FOR_FIELD
  1406: '22001', // ER_DATA_TOO_LONG            → string_data_right_truncation
  1264: '22003', // ER_WARN_DATA_OUT_OF_RANGE   → numeric_value_out_of_range
  1366: '22P02', // ER_TRUNCATED_WRONG_VALUE_FOR_FIELD → invalid_text_representation
  1292: '22P02', // ER_TRUNCATED_WRONG_VALUE (incl. bad UUID / datetime text)
  1213: '40P01', // ER_LOCK_DEADLOCK            → deadlock_detected
  1205: '40001', // ER_LOCK_WAIT_TIMEOUT        → treated as serialization_failure (retryable)
  1146: '42P01', // ER_NO_SUCH_TABLE            → undefined_table (checked by "migration not applied" guards)
  1054: '42703', // ER_BAD_FIELD_ERROR          → undefined_column
};

/**
 * Give a MariaDB error the fields node-postgres errors carry. Mutates and
 * returns the same Error so stack traces stay intact.
 */
async function toPgError(err) {
  if (!err || typeof err.errno !== 'number' || err.pgShaped) return err;
  const sqlstate = SQLSTATE_BY_ERRNO[err.errno];
  err.mysqlCode = err.code;
  err.pgShaped = true;
  if (!sqlstate) {
    err.code = err.sqlState || err.code;
    return err;
  }
  err.code = sqlstate;
  const msg = String(err.sqlMessage ?? err.message ?? '');

  if (sqlstate === '23505') {
    // Duplicate entry 'v' for key 'name'   (key may be prefixed with the table)
    const m = /Duplicate entry '([\s\S]*)' for key '(?:([^'.]+)\.)?([^']+)'/.exec(msg);
    if (m) {
      const [, value, table, key] = m;
      const info = await keyColumns(table, key);
      err.constraint = key;
      err.table = info.table;
      err.detail = `Key (${info.columns.join(', ')})=(${value}) already exists.`;
    }
  } else if (sqlstate === '23503') {
    // ... fails ("db"."child", CONSTRAINT "name" FOREIGN KEY ("col") REFERENCES "parent" ("id") ...)
    // Identifiers are quoted with " under ANSI_QUOTES, with ` otherwise.
    const m = /\([`"][^`"]+[`"]\.[`"]([^`"]+)[`"], CONSTRAINT [`"]([^`"]+)[`"] FOREIGN KEY \(([^)]+)\) REFERENCES [`"]([^`"]+)[`"]/.exec(msg);
    if (m) {
      const [, child, name, cols, parent] = m;
      const columns = cols.replace(/[`"]/g, '').split(/\s*,\s*/).join(', ');
      err.constraint = name;
      if (err.errno === 1452) {
        err.table = child;
        err.detail = `Key (${columns}) is not present in table "${parent}".`;
      } else {
        err.table = parent;
        err.detail = `Key is still referenced from table "${child}".`;
      }
    }
  } else if (sqlstate === '23514') {
    // CONSTRAINT `name` failed for `db`.`table`   (or "…" under ANSI_QUOTES)
    const m = /CONSTRAINT [`"]([^`"]+)[`"] failed for [`"][^`"]+[`"]\.[`"]([^`"]+)[`"]/.exec(msg);
    if (m) {
      err.constraint = m[1];
      err.table = m[2];
    }
  } else if (sqlstate === '23502') {
    const m = /(?:Column|Field) '([^']+)'/.exec(msg);
    if (m) err.column = m[1];
  }
  return err;
}

// ---------------------------------------------------------------------------
// Test scope: everything on one connection, inside a transaction that is
// always rolled back. See beginTestScope().
// ---------------------------------------------------------------------------

/** @type {null | { conn: import('mysql2/promise').PoolConnection, savepoints: number, queue: Promise<void> }} */
let testScope = null;

// Marks code running inside a test-scope savepoint, so a transaction opened
// from within another one nests instead of queueing behind itself.
const insideSavepoint = new AsyncLocalStorage();

// Statements that end the outer transaction (explicitly, or as DDL does,
// implicitly) and would therefore let test writes persist.
const COMMITS_IMPLICITLY = /^\s*(START\s+TRANSACTION|BEGIN\b|COMMIT\b|ROLLBACK\s*;?\s*$|SET\s+(SESSION\s+)?autocommit|CREATE\b|ALTER\b|DROP\b|TRUNCATE\b|RENAME\b|GRANT\b|REVOKE\b|LOCK\s+TABLES|UNLOCK\s+TABLES|LOAD\b|ANALYZE\b|OPTIMIZE\b|REPAIR\b|FLUSH\b|SET\s+GLOBAL)/i;

// node --test sets NODE_TEST_CONTEXT in the processes it runs test files in.
// Never set in production.
const UNDER_NODE_TEST = Boolean(process.env.NODE_TEST_CONTEXT);

async function run(executor, text, params) {
  // A test that reaches the real database outside a test scope would commit
  // to it — the staging copy now, production after cutover. Refuse instead.
  // (On 2026-10-14 a test run deleted real banners from the shared database.)
  if (UNDER_NODE_TEST && !testScope) {
    throw new Error(
      '[db] refused: database access under `node --test` outside beginTestScope(). ' +
        'Tests must run inside a test scope (always rolled back) or mock the repositories.',
    );
  }
  if (testScope && COMMITS_IMPLICITLY.test(text)) {
    throw new Error(`[db] refused inside a test scope (would commit the outer transaction): ${text.trim().slice(0, 80)}`);
  }
  const { sql, values } = bindParams(text, params);
  try {
    return toPgResult(await executor.query(sql, values));
  } catch (err) {
    throw await toPgError(err);
  }
}

// ---------------------------------------------------------------------------
// Public API (same names and shapes as the pg version)
// ---------------------------------------------------------------------------

/** Translate pg transaction keywords the code issues by hand. */
function normaliseTxStatement(text) {
  const t = text.trim().replace(/;$/, '').toUpperCase();
  if (t === 'BEGIN' || t === 'BEGIN TRANSACTION') return 'START TRANSACTION';
  return text;
}

/** Wrap a pooled connection so it looks like a pg PoolClient. */
function wrapConnection(conn) {
  return {
    query: (text, params = []) => run(conn, normaliseTxStatement(text), params),
    release: () => conn.release(),
  };
}

/**
 * pg-Pool-shaped handle. query() and withTransaction() go through
 * `pool.query` / `pool.connect`, as they did with pg, so a test can stand in
 * for the database by mocking those two methods.
 */
export const pool = {
  query: (text, params = []) => run(testScope ? testScope.conn : mysqlPool, text, params),
  connect: async () => {
    if (testScope) {
      return { query: (text, params = []) => run(testScope.conn, text, params), release: () => {} };
    }
    if (UNDER_NODE_TEST) {
      throw new Error('[db] refused: pool.connect() under `node --test` outside beginTestScope().');
    }
    return wrapConnection(await mysqlPool.getConnection());
  },
  end: () => mysqlPool.end(),
  raw: mysqlPool,
};

/**
 * Run a single parameterised query against the pool.
 * @param {string} text  SQL with $1, $2 … placeholders
 * @param {unknown[]} [params]
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
export function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * SQLSTATEs (after translation) that mean "this transaction did not happen —
 * run it again".
 *
 * 40P01  deadlock: InnoDB picked this transaction as the victim and rolled it
 *        back whole.
 * 40001  lock wait timeout (MariaDB 1205). Only the statement is rolled back,
 *        but withTransaction rolls back the rest before retrying, so the redo
 *        starts clean.
 *
 * Retrying is safe for exactly that reason, and is safe for nothing else:
 * every other error is passed straight up. In particular a checkout refused
 * for want of stock is a *decision*, not a failure, and running it again
 * would not change the answer.
 *
 * This matters at the till. Two shoppers buying the same two pieces in
 * opposite order is a deadlock the checkout query is written to avoid — it
 * locks variants in id order — but a cancellation restoring stock while a
 * checkout reserves it can still collide, and a rush hour is precisely when
 * that stops being theoretical. Without this, one of the two shoppers gets a
 * 500 for a transaction that would have succeeded a millisecond later.
 */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

/**
 * Run `fn(client)` inside a transaction. Commits on success, rolls back on throw.
 *
 * `fn` may run more than once — see RETRYABLE_SQLSTATES — so it must not carry
 * side effects outside the transaction it is handed. Everything it needs to
 * redo must go through `client`.
 *
 * @template T
 * @param {(client: {query: typeof query}) => Promise<T>} fn
 * @param {{retries?: number}} [options] how many times to re-run after a
 *        deadlock or lock timeout. Zero disables retrying.
 * @returns {Promise<T>}
 */
export async function withTransaction(fn, { retries = 2 } = {}) {
  if (testScope) return withSavepoint(fn);

  for (let attempt = 0; ; attempt += 1) {
    // pool.connect refuses under node --test outside a test scope (unless a
    // test has mocked it).
    const client = await pool.connect();

    try {
      await client.query('START TRANSACTION');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (rawErr) {
      const err = await toPgError(rawErr);
      // The rollback's own failure must not replace the error that caused it —
      // a dead connection reports "connection lost" and the real reason
      // is lost.
      await client.query('ROLLBACK').catch(() => {});

      if (attempt >= retries || !RETRYABLE_SQLSTATES.has(err?.code)) throw err;

      console.warn(
        `[db] ${err.code} on attempt ${attempt + 1}, retrying the transaction`,
      );

      // Both sides of a deadlock retry at once otherwise, and collide again.
      // The jitter is what breaks the tie; the growth keeps a busy minute from
      // turning into a retry storm.
      await new Promise((resolve) =>
        setTimeout(resolve, 25 * (attempt + 1) + Math.random() * 25),
      );
    } finally {
      client.release();
    }
  }
}

/**
 * Inside a test scope a "transaction" is a savepoint on the scope's single
 * connection.
 *
 * Transactions that would have had connections of their own in production —
 * e.g. the email dispatch a settle kicks off after committing — are queued
 * one at a time here. Interleaved on one connection, one's ROLLBACK TO /
 * RELEASE SAVEPOINT would discard the other's later savepoint.
 */
async function withSavepoint(fn) {
  const scope = testScope;
  const nested = insideSavepoint.getStore() === scope;

  let releaseTurn = () => {};
  if (!nested) {
    const previous = scope.queue;
    scope.queue = new Promise((resolve) => {
      releaseTurn = resolve;
    });
    await previous;
  }

  const { conn } = scope;
  const name = `sp_${(scope.savepoints += 1)}`;
  try {
    await conn.query(`SAVEPOINT ${name}`);
    try {
      const result = await insideSavepoint.run(scope, () =>
        fn({ query: (text, params = []) => run(conn, text, params), release: () => {} }),
      );
      await conn.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (rawErr) {
      const err = await toPgError(rawErr);
      await conn.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {});
      throw err;
    }
  } finally {
    releaseTurn();
  }
}

/**
 * Start a test scope: from here until endTestScope(), query() and
 * withTransaction() — and so every repository — run on ONE connection inside
 * a transaction that endTestScope() rolls back. Repository transactions become
 * savepoints. Statements that would commit implicitly (DDL, COMMIT, a nested
 * START TRANSACTION) are refused while it is open.
 *
 * Caveat: sequences are not transactional. NEXTVAL(orders_number_seq) inside a
 * scope consumes the number for good (the copy script resets it at cutover).
 *
 * Not available in production.
 */
export async function beginTestScope() {
  if (env.isProd) throw new Error('beginTestScope() is not available in production');
  if (testScope) throw new Error('A test scope is already open');
  const conn = await mysqlPool.getConnection();
  await conn.query('START TRANSACTION');
  testScope = { conn, savepoints: 0, queue: Promise.resolve() };
}

/** Roll back everything done since beginTestScope() and release its connection. */
export async function endTestScope() {
  if (!testScope) return;
  const { conn } = testScope;
  testScope = null;
  try {
    await conn.query('ROLLBACK');
  } finally {
    conn.release();
  }
}

/** Verify connectivity once at startup. Throws if the DB is unreachable. */
export async function connectDb() {
  // Goes through query(), so under node --test it is refused like any other
  // access outside a test scope.
  const { rows } = await query('SELECT NOW(6) AS now, DATABASE() AS db, VERSION() AS version');
  console.log(`[db] Connected to "${rows[0].db}" (${rows[0].version}) at ${rows[0].now.toISOString()}`);
}

/** Drain the pool during shutdown. */
export function closeDb() {
  return mysqlPool.end();
}

// Exposed for unit tests of the translation layer.
export const __internals = { translatePlaceholders, bindParams, toPgError, convertRow };
