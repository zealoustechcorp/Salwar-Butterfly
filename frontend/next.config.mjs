import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Cloudflare R2, through the bucket's custom domain. Everything the
      // admin uploads lands here, and the migration script
      // (backend/src/scripts/migrateImagesToR2.js) moved the older
      // Cloudinary images here too.
      {
        protocol: "https",
        hostname: "images.salwarbutterfly.in",
        pathname: "/**",
      },

      // Cloudinary, for the rows the migration could not copy: the old
      // shop's account (ddvui6pi4) is disabled and answers 401, so those
      // URLs are still in the database pointing at it. Photo falls back to
      // the illustration for them either way; this only keeps next/image
      // from refusing them outright. Remove once no row points here.
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
