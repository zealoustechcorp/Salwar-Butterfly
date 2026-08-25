import fs from 'node:fs';
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

/**
 * TLS settings for the managed PostgreSQL service.
 * - With PG_CA_CERT_PATH set, the server certificate is fully verified against that CA.
 * - Without it, TLS is still used (sslmode=require) but the CA chain is not verified.
 */
function buildSslConfig() {
  if (env.pgCaCertPath) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(env.pgCaCertPath, 'utf8'),
    };
  }
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
 * Run `fn(client)` inside a transaction. Commits on success, rolls back on throw.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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
