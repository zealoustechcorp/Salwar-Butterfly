import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Two Cloudinary accounts are in play, so the pathname is left open
    // rather than pinned to one cloud name:
    //
    //   the live shop's (ddvui6pi4) — the storefront photography that came
    //   across with the catalogue and is still what most products point at
    //
    //   this project's own — everything the admin uploads, category
    //   covers and product galleries alike. Its cloud name lives in the
    //   API's environment, so the frontend cannot name it at build time.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

/**
 * Sentry's build step, wrapped around the config above.
 *
 * Its job is source maps. A production bundle is minified, so a stack
 * trace arriving from a shopper's browser points at `a.b` on line 1 of
 * a hashed chunk — useless on its own. This uploads the maps to Sentry
 * so the report shows the real file and line, then deletes them from
 * the deployed output so nobody can read the shop's source by asking
 * the server for them.
 *
 * All of that needs SENTRY_AUTH_TOKEN, which is a real secret and
 * belongs in the deploy environment, not in .env.local. Without it the
 * plugin logs that it is skipping the upload and the build carries on —
 * which is what happens on every local build, and is fine: a dev build
 * is not minified, so the stack traces are already readable.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only the plugin's own errors, not a per-file upload log.
  silent: !process.env.CI,

  // Strip the maps from the build output once Sentry has them.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Routes browser events through /monitoring on this origin instead of
  // straight to Sentry's ingest domain. Ad blockers block the latter by
  // name, and a blocked SDK reports nothing at all — which looks
  // exactly like a quiet week.
  tunnelRoute: "/monitoring",
});
