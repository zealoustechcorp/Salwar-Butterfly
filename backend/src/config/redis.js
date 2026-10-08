// src/config/redis.js
//
// The single place that knows how to talk to Redis — the role db.js
// plays for Postgres.
//
// Two consumers, and they want opposite things from a connection:
//
//   Rate limiting (rateLimiter.js) issues short commands on the request
//   path. A shopper is waiting on the other end of every one of them, so
//   a command that cannot complete has to give up quickly and let the
//   request through rather than hold it open.
//
//   Queue workers (BullMQ, Item 5) sit on a blocking BRPOPLPUSH for
//   minutes at a time and must never be given up on. BullMQ refuses to
//   start on a connection it does not own, which is why this module
//   hands out a factory as well as a shared client.
//
// Hence one base config and two small departures from it, each explained
// where it is made.
//
// Nothing here is fatal. Redis is optional infrastructure: with no
// REDIS_URL the module is never asked for a client at all (env.redis
// .enabled is what callers check), and with one that is temporarily
// unreachable the errors are logged and the features above degrade. An
// unreachable cache must not take the shop down.

import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * Options shared by every connection this module creates.
 *
 * `rediss://` URLs carry TLS and ioredis reads the scheme itself, so
 * there is no equivalent of db.js's CA handling here — Aiven's Redis
 * certificate is signed by a public root, unlike its Postgres one.
 */
const baseOptions = {
  // Without a name, `CLIENT LIST` on a struggling instance is a wall of
  // anonymous connections and there is no telling the API's from a
  // worker's.
  connectionName: "salwar-butterfly",

  /**
   * How long to wait before each reconnection attempt, in ms.
   *
   * Growth by 100ms per attempt, capped at two seconds: quick enough
   * that a one-second blip is invisible, slow enough that an instance
   * which is genuinely down is not being dialled fifty times a second
   * by every container at once.
   */
  retryStrategy: (times) => Math.min(times * 100, 2000),

  // A managed Redis fails over by moving the endpoint, and the first
  // command after one lands on a read-only replica. ioredis reconnects
  // on this error rather than passing it up as a failed command.
  reconnectOnError: (err) => err.message.includes("READONLY"),
};

/** @type {import('ioredis').Redis | null} */
let client = null;

/**
 * The shared client, for ordinary short-lived commands (rate limiting).
 *
 * Created on first use and reused thereafter — one connection for the
 * whole process, in the way `pool` is one pool.
 *
 * Only call this when `env.redis.enabled`; it throws otherwise, because
 * the alternative is a module that silently connects to localhost on a
 * machine that never asked for Redis.
 */
export function getRedisClient() {
  if (!env.redis.enabled) {
    throw new Error(
      "getRedisClient() called with no REDIS_URL configured — " +
        "check env.redis.enabled first",
    );
  }

  if (client) return client;

  client = new Redis(env.redis.url, {
    ...baseOptions,

    /**
     * Three attempts, then the command rejects. This is the departure
     * from the worker connections below, and the reason is the request
     * path: `null` here would mean a rate limit check on an unreachable
     * Redis hangs until the shopper gives up, turning a cache outage
     * into a site outage. Failing after about a second lets
     * rateLimiter.js make its own decision about what to do instead.
     */
    maxRetriesPerRequest: 3,
  });

  // ioredis throws an unhandled error event if nothing is listening, so
  // this listener is what keeps a dropped connection from ending the
  // process. Reconnection is automatic; there is nothing to do but say
  // so.
  client.on("error", (err) => {
    logger.error("Redis connection error", {
      message: err.message,
      code: err.code,
    });
  });

  client.on("ready", () => {
    logger.info("Redis connected");
  });

  return client;
}

/**
 * A dedicated connection, for a consumer that needs to own one.
 *
 * BullMQ (Item 5) needs one per queue and per worker: a worker spends
 * its life inside a blocking command, so the connection cannot be shared
 * with anything that expects an answer in the meantime.
 *
 * @param {string} name  appears in CLIENT LIST — say what it is for
 * @returns {import('ioredis').Redis}
 */
export function createRedisConnection(name) {
  if (!env.redis.enabled) {
    throw new Error(
      "createRedisConnection() called with no REDIS_URL configured — " +
        "check env.redis.enabled first",
    );
  }

  const connection = new Redis(env.redis.url, {
    ...baseOptions,
    connectionName: `${baseOptions.connectionName}:${name}`,

    /**
     * BullMQ requires exactly this and refuses to start without it. Its
     * workers block on a command for as long as the queue is empty,
     * which any finite retry count would eventually abandon — and an
     * abandoned blocking read is a worker that has stopped taking jobs
     * while still looking alive.
     */
    maxRetriesPerRequest: null,
  });

  connection.on("error", (err) => {
    logger.error("Redis connection error", {
      connection: name,
      message: err.message,
      code: err.code,
    });
  });

  return connection;
}

/**
 * Close the shared client during shutdown — the counterpart of closeDb().
 *
 * `quit` waits for in-flight commands and says goodbye properly; if the
 * connection is already gone that never resolves, so the failure is
 * swallowed and the socket dropped. A shutdown path must end.
 */
export async function closeRedis() {
  if (!client) return;

  const closing = client;
  client = null;

  try {
    await closing.quit();
  } catch {
    closing.disconnect();
  }
}
