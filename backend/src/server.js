import http from 'node:http';
import app from './app.js';
import { env } from './config/env.js';
import { connectDb, closeDb } from './config/db.js';

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
