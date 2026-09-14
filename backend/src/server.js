import http from 'node:http';
import * as Sentry from '@sentry/node';
import app from './app.js';
import { env } from './config/env.js';
import { connectDb, closeDb } from './config/db.js';
import { closeRedis } from './config/redis.js';
import { closeWebhookQueue } from './queues/webhook.queue.js';
import { startWebhookWorker, stopWebhookWorker } from './queues/webhook.worker.js';

const server = http.createServer(app);

async function start() {
  await connectDb();
  // After the database, because the first thing the worker does with a
  // job is query it — and a no-op without REDIS_URL, in which case the
  // webhook endpoint processes deliveries inline instead.
  startWebhookWorker();
  server.listen(env.port, () => {
    console.log(`[server] Listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });
}

async function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(async () => {
    // Before the pool drains: the worker finishes the job in its hands,
    // and that job is in the middle of a transaction.
    await stopWebhookWorker();
    await closeWebhookQueue();
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
