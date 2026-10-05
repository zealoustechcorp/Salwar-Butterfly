import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const AIVEN_CA_HINT =
  'download it from the Aiven console: the PostgreSQL service → Overview → CA Certificate';

/**
 * TLS settings for the managed PostgreSQL service.
 * - With PG_CA_CERT set, the server certificate is fully verified against that CA.
 * - Without it, TLS is still used (sslmode=require) but the CA chain is not verified.
 *
 * Aiven signs each project's certificate with its own private CA rather than a
 * public root, so the CA is what makes verification possible at all —
 * rejectUnauthorized: true on its own would reject the real server too.
 */
function buildSslConfig() {
  if (env.pgCaCert) {
    return { rejectUnauthorized: true, ca: env.pgCaCert };
  }

  // Encrypted, but unauthenticated: any certificate is accepted, so anyone who
  // can redirect the traffic can terminate the TLS and read the credentials out
  // of the startup packet. Production never reaches here — env.js refuses to
  // boot without the variable — which leaves this the developer's own machine,
  // where the only real danger is not knowing.
  console.warn(
    '[db] PG_CA_CERT not set — the Postgres TLS certificate is NOT being ' +
      `verified. To fix: ${AIVEN_CA_HINT}, and paste its contents into ` +
      'PG_CA_CERT in backend/.env',
  );

  return { rejectUnauthorized: false };
}

/**
 * pg parses `sslmode=` from the URL and lets it override the explicit `ssl`
 * option, so strip it and manage TLS via buildSslConfig() instead.
 */
function stripSslMode(url) {
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  return u.toString();
}

export const pool = new Pool({
  connectionString: stripSslMode(env.databaseUrl),
  ssl: buildSslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

/**
 * Run a single parameterised query against the pool.
 * @param {string} text  SQL with $1, $2 … placeholders
 * @param {unknown[]} [params]
 */
export function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Postgres SQLSTATEs that mean "this transaction did not happen — run it again".
 *
 * 40P01 deadlock_detected      two transactions took the same rows in
 *                              opposite orders and Postgres shot one of them.
 * 40001 serialization_failure  a concurrent write made this snapshot
 *                              unusable.
 *
 * Both arrive only after a full rollback, so nothing was committed and the
 * work can simply be redone. Retrying is safe for exactly that reason, and is
 * safe for nothing else: every other error is passed straight up. In
 * particular a checkout refused for want of stock is a *decision*, not a
 * failure, and running it again would not change the answer.
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
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @param {{retries?: number}} [options] how many times to re-run after a
 *        deadlock or serialization failure. Zero restores the old behaviour.
 * @returns {Promise<T>}
 */
export async function withTransaction(fn, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      // The rollback's own failure must not replace the error that caused it —
      // a dead connection reports "connection terminated" and the real reason
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

/** Verify connectivity once at startup. Throws if the DB is unreachable. */
export async function connectDb() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT NOW() AS now, current_database() AS db');
    console.log(`[db] Connected to "${rows[0].db}" at ${rows[0].now.toISOString()}`);
  } finally {
    client.release();
  }
}

/** Drain the pool during shutdown. */
export function closeDb() {
  return pool.end();
}
