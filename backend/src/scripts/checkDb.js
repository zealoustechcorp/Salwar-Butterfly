/**
 * One-off connectivity check: `npm run db:check`
 */
import { connectDb, closeDb } from '../config/db.js';

try {
  await connectDb();
  console.log('[db:check] OK');
} catch (err) {
  console.error('[db:check] FAILED', err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
