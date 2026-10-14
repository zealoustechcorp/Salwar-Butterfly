// src/app.js

import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import routes from "./routes/index.js";

import { notFound } from "./middlewares/notFound.js";
import { globalErrorHandler } from "./middlewares/globalErrorHandler.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { globalRateLimiter } from "./middlewares/rateLimiter.js";

const app = express();

// ============================================================
// SECURITY
// ============================================================

app.disable("x-powered-by");

// One reverse proxy (the host's load balancer) sits in front of the API in
// production. Trusting exactly one hop makes req.ip the shopper's address
// from X-Forwarded-For rather than the proxy's — without it every visitor
// shares one rate-limit bucket. Not `true`: that would trust any
// X-Forwarded-For a client sends and let them pick their own IP.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: env.isProd,
    crossOriginEmbedderPolicy: env.isProd,
  }),
);

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  }),
);

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use(requestLogger);

// ============================================================
// RATE LIMITING
// ============================================================

app.use("/api", globalRateLimiter);

// ============================================================
// BODY PARSING
// ============================================================

/**
 * The Razorpay webhook, and only it, keeps its body unparsed (F-10).
 *
 * The delivery is signed with an HMAC over the exact bytes Razorpay
 * sent. Parsing the JSON and re-serialising it to check that signature
 * would reorder keys and change the whitespace, producing a different
 * digest — the endpoint would then reject every genuine delivery while
 * accepting nothing, which looks from the outside like "webhooks don't
 * work" rather than like a bug with a cause.
 *
 * Mounted before express.json so it wins for this path. body-parser
 * marks a request it has handled, so the JSON parser below sees this one
 * is done and leaves it alone; `req.body` stays the Buffer, and the
 * handler reads it as `req.rawBody`.
 *
 * Whatever the Content-Type says. This used to accept only
 * `application/json`, and a delivery labelled anything else — a
 * charset variant some proxy rewrote, `text/plain`, nothing at all —
 * fell through to the parsers below, arrived without its raw bytes, and
 * was answered 500 "Webhook body was parsed before it could be
 * verified". The signature is over bytes, not over a media type; the
 * HMAC decides whether the body is genuine and JSON.parse decides
 * whether it is readable, and both answer 400 when it is not. The
 * header is not evidence of either.
 *
 * A POST with no body at all gets an empty Buffer rather than null, so
 * it too reaches the signature check and is refused there as a 400
 * instead of tripping over a missing buffer.
 */
const keepRawBody = [
  express.raw({ type: () => true, limit: "1mb" }),
  (req, res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    next();
  },
];

app.use("/api/payments/webhook", keepRawBody);

/**
 * Meta's delivery receipts, for the same reason and with a different
 * secret (F-12).
 *
 * X-Hub-Signature-256 is an HMAC over the exact bytes Meta sent, keyed
 * with the app secret. Unmounted routes still pass through here — the
 * router itself is mounted only when receipts are configured — which
 * costs nothing: express.raw on a path that 404s is one buffer that is
 * never read.
 *
 * The handshake is a GET and carries no body, so it falls through this
 * untouched.
 */
app.use("/api/whatsapp/webhook", keepRawBody);

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "1mb",
  }),
);

// ============================================================
// ROUTES
// ============================================================

app.use("/api", routes);

// ============================================================
// 404
// ============================================================

app.use(notFound);

// ============================================================
// FINAL ERROR BOUNDARY
// ============================================================

app.use(globalErrorHandler);

export default app;
