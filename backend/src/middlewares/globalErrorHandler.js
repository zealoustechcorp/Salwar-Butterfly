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

  // Below 500 the caller is at fault, not the server — a malformed body
  // or a bad id is not an incident, and logging it at error level buries
  // the ones that are.
  const log = statusCode >= 500 ? logger.error : logger.warn;

  log("Request failed", {
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
  //
  // Not every one of these is the server's fault. Express's own
  // middleware throws errors that already carry a status — body-parser
  // tags a malformed JSON body 400, multer tags an oversized upload
  // 413 — and answering those with a 500 tells the caller to retry
  // something that will never work. Honour the status the error came
  // with; 500 is only the fallback for errors that named none.

  const isServerFault = statusCode >= 500;

  return res.status(statusCode).json({
    success: false,

    message:
      env.isProd && isServerFault ? "Internal Server Error" : err.message,

    ...(env.isProd
      ? {}
      : {
          stack: err.stack,
        }),
  });
};
