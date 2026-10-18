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

/**
 * The logo as a link preview's og:image / twitter:image — what any shared
 * URL unfurls with unless its page names a picture of its own (a product
 * page uses its photo). A copy of public/Salwar Butterfly.jpeg under a name
 * with no space, so the URL crawlers fetch needs no escaping. 221 KB, under
 * the ~300 KB past which WhatsApp drops the image.
 *
 * Relative; `metadataBase` in the root layout makes it absolute.
 */
export const SHARE_LOGO = {
  url: "/share-logo.jpg",
  width: 1254,
  height: 1254,
  type: "image/jpeg",
  alt: "Salwar Butterfly",
};
