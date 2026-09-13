// src/middlewares/globalErrorHandler.js

import * as Sentry from "@sentry/node";

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
  // the ones that are. The same line decides what Sentry hears about.
  const isServerFault = statusCode >= 500;

  const log = isServerFault ? logger.error : logger.warn;

  log("Request failed", {
    method: req.method,
    url: req.originalUrl,
    statusCode,
    message: err.message,
    stack: err.stack,
    ip: req.ip,
  });

  // ============================================================
  // REPORT TO SENTRY
  // ============================================================
  //
  // The same 500 line the logger draws above, for the same reason: a
  // 404 or a rejected body is the caller's problem and a dashboard full
  // of them is a dashboard nobody reads. Sentry's own express handler
  // would apply roughly this rule, but it is left out of app.js so the
  // decision lives here next to the logging it mirrors, and so nothing
  // gets reported twice.
  //
  // This runs inside the request, so the SDK attaches the route, the
  // trace and the breadcrumbs on its own; what it cannot know is who
  // was signed in and which of our ApiError codes this was, so those go
  // on by hand. Nothing here is guarded by `env.sentry.enabled` —
  // without a DSN the SDK has no client and these calls return
  // immediately.

  if (isServerFault) {
    Sentry.withScope((scope) => {
      scope.setTag("http.status_code", String(statusCode));

      if (err instanceof ApiError && err.code) {
        scope.setTag("api.error_code", err.code);
      }

      if (req.user?.id) {
        // No email: sendDefaultPii is off (see instrument.js) and an id
        // is enough to find the row that was involved.
        scope.setUser({
          id: String(req.user.id),
          role: req.user.role,
          typ: req.user.typ,
        });
      }

      scope.setContext("request", {
        method: req.method,
        url: req.originalUrl,
        statusCode,
      });

      Sentry.captureException(err);
    });
  }

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
