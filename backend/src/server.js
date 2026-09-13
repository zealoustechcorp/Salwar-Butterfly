import http from 'node:http';
import * as Sentry from '@sentry/node';
import app from './app.js';
import { env } from './config/env.js';
import { connectDb, closeDb } from './config/db.js';
import { closeRedis } from './config/redis.js';

const server = http.createServer(app);

async function start() {
  await connectDb();
  server.listen(env.port, () => {
    console.log(`[server] Listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

async function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(async () => {
    await closeDb();
    // A no-op unless something actually opened a connection, so this
    // stays correct on a machine with no REDIS_URL.
    await closeRedis();
    // Sentry batches events and sends them on a timer, so the error
    // that took the process down is usually still in the queue when the
    // process ends. flush() drains it; the timeout caps how long a
    // shutdown waits on the network, and it resolves either way.
    await Sentry.flush(2000);
    process.exit(0);
  });
  // Hard exit if something keeps the loop alive.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[server] Failed to start', err);
  process.exit(1);
});
