/**
 * Sentry for the node server runtime — server components, route
 * handlers, server actions, and the catalogue reads in src/lib/store.
 *
 * Loaded by src/instrumentation.js, which Next calls once per server
 * instance before it handles a request. The filename is Sentry's own
 * convention; keeping it means their docs describe this project.
 *
 * Note what this does *not* cover: the Express API in ../backend is a
 * separate process with its own DSN and its own init, in
 * backend/src/instrument.js. An order that fails because the API
 * returned a 500 produces two reports, one on each side, and they are
 * both worth having — this one knows which page the shopper was on, and
 * that one knows which query broke.
 */

import * as Sentry from "@sentry/nextjs";

import { sentryEnabled, sharedSentryOptions } from "./src/lib/monitoring/sentry";

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
  });
}
