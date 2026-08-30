// src/middlewares/globalErrorHandler.js

import { logger } from "../utils/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { env } from "../config/env.js";

export const globalErrorHandler = (err, req, res, next) => {
  // If headers have already been sent,
  // delegate to Express's default error handler.
  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    err instanceof ApiError ? err.statusCode : err.status || 500;

  // ============================================================
  // LOG ERROR
  // ============================================================

  logger.error("Request failed", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message: err.message,
    stack: err.stack,
    ip: req.ip,
  });

  // ============================================================
  // KNOWN APPLICATION ERROR
  // ============================================================

  if (err instanceof ApiError) {
    return res.status(statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.details ? { details: err.details } : {}),
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  // ============================================================
  // UNKNOWN ERROR
  // ============================================================

  return res.status(500).json({
    success: false,

    message: env.isProd ? "Internal Server Error" : err.message,

    ...(env.isProd
      ? {}
      : {
          stack: err.stack,
        }),
  });
};
