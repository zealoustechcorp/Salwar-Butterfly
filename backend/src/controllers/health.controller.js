import { query } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** GET /api/health — process liveness */
export const getHealth = (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
};

/** GET /api/health/db — database reachability */
export const getDbHealth = asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT NOW() AS now, version() AS version');
  res.json({ status: 'ok', db: rows[0] });
});
