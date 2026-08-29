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
