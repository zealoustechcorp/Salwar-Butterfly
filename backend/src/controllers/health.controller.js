import { query } from '../config/db.js';

/** GET /api/health — process liveness */
export const getHealth = (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
};

/**
 * GET /api/health/db — database reachability
 *
 * Public, so it says only "up" or "down": it used to return
 * `SELECT version()`, which told anyone the exact Postgres build to look
 * up weaknesses for. Down is a 503 rather than the generic 500, so an
 * uptime monitor and a load balancer read it as "unavailable", which is
 * what it is.
 */
export const getDbHealth = async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'unavailable', db: 'down' });
  }
};
