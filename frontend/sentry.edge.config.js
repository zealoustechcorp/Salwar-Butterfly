/**
 * Sentry for the edge runtime.
 *
 * Nothing in the shop opts into `export const runtime = "edge"` today,
 * so on current code this file initialises a runtime that never runs.
 * It is here because the day something does — proxy, a rewrite, a route
 * handler moved for latency — the failure mode without it is silence
 * rather than an error, and silence is the expensive kind of missing.
 *
 * The edge runtime is a Web-API sandbox, not node: no filesystem, no
 * native modules, a smaller Sentry build. Which is the other reason it
 * is a separate file from sentry.server.config.js rather than a flag.
 */

import * as Sentry from "@sentry/nextjs";

import { sentryEnabled, sharedSentryOptions } from "./src/lib/monitoring/sentry";

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
  });
}
