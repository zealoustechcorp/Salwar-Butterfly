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
 */
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    next();
  },
);

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
