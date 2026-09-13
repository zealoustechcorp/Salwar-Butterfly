/**
 * Sentry, initialised before the rest of the process exists.
 *
 * This file is not imported by the application. It is loaded by node
 * itself, through `--import=./src/instrument.js` in the package.json
 * scripts, and that placement is the whole point rather than a style
 * choice.
 *
 * Sentry instruments express, pg and http by patching their exports as
 * they are loaded. Under ESM a module is evaluated once and its
 * bindings are frozen, so anything imported before `Sentry.init()` runs
 * is past the point where it can be patched — the SDK would still
 * report errors handed to it by hand, but the request that failed, the
 * route it hit and the queries it ran would all be missing. `--import`
 * is node's hook for running a module ahead of the entry point, which
 * is the only place early enough to be sure.
 *
 * With no SENTRY_DSN set, init is never called and every `Sentry.*`
 * call elsewhere in the codebase quietly does nothing. That is the
 * normal state on a laptop; see config/env.js.
 */

import * as Sentry from "@sentry/node";

import { env } from "./config/env.js";

// ============================================================
// SENSITIVE FIELDS
// ============================================================
//
// The same list utils/logger.js redacts, for the same reason: an error
// report carries whatever was on the request, and a password or a
// bearer token on a 500 would otherwise be readable by anyone with a
// Sentry login. Headers are matched case-insensitively because HTTP
// does not agree on a casing.

const sensitiveHeaders = ["authorization", "cookie", "set-cookie", "x-api-key"];

const scrubHeaders = (headers) => {
  if (!headers || typeof headers !== "object") {
    return headers;
  }

  const scrubbed = { ...headers };

  for (const key of Object.keys(scrubbed)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    }
  }

  return scrubbed;
};

// ============================================================
// INIT
// ============================================================

if (env.sentry.enabled) {
  Sentry.init({
    dsn: env.sentry.dsn,

    environment: env.sentry.environment,

    // undefined, not null: the SDK reads an absent release as "unknown"
    // and a null as a release literally named "null".
    release: env.sentry.release ?? undefined,

    // Off unless SENTRY_TRACES_SAMPLE_RATE says otherwise. Errors cost
    // nothing extra; traces are billed per transaction.
    tracesSampleRate: env.sentry.tracesSampleRate,

    // Leave IPs, cookies and request bodies out of the report by
    // default. The pieces actually worth having — method, URL, status,
    // the user id — are attached deliberately in the error handler.
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request?.headers) {
        event.request.headers = scrubHeaders(event.request.headers);
      }

      // The Razorpay webhook body is a raw Buffer (see app.js) and a
      // signed payload besides. Serialising it into an error report
      // gains nothing readable and ships payment data to a third party.
      if (event.request?.url?.includes("/api/payments/webhook")) {
        delete event.request.data;
      }

      return event;
    },
  });

  console.log(
    `[sentry] reporting enabled (${env.sentry.environment}` +
      `${env.sentry.tracesSampleRate > 0 ? `, traces @ ${env.sentry.tracesSampleRate}` : ""})`,
  );
}

export { Sentry };
