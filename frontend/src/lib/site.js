/**
 * The storefront's public origin — what search engines, link previews and
 * the sitemap call this site.
 *
 * Inlined at build time like every NEXT_PUBLIC_ variable, so it has to be
 * set in the build environment, not only at runtime. Left unset it falls
 * back to the local dev server, which is right on a laptop and wrong in
 * production: every canonical URL and og:image would point at localhost.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
