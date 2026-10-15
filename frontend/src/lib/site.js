/**
 * The storefront's public origin — what search engines, link previews and
 * the sitemap call this site.
 *
 * Inlined at build time like every NEXT_PUBLIC_ variable, so it has to be
 * set in the build environment, not only at runtime.
 *
 * Unset, it falls back to `URL`, which Netlify sets on every build to the
 * site's main address (the custom domain once one is attached, otherwise
 * the *.netlify.app one). Without that the production build fell through
 * to localhost, and every canonical URL and og:image pointed there — a
 * shared product link unfurled with no picture. Only server code reads
 * this, which is where `URL` is visible; localhost is left for a laptop.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");
