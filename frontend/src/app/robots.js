import { SITE_URL } from "@/lib/site";

/**
 * robots.txt.
 *
 * The catalogue is public and should be crawled. Everything below is
 * either private (the admin panel, a shopper's account), per-visitor (bag,
 * wishlist, checkout) or a one-off link (password reset) — none of it is a
 * page anybody should land on from a search result. /monitoring is the
 * Sentry tunnel (see next.config.mjs), not a page at all.
 *
 * This is advice to well-behaved crawlers, not access control: the admin
 * panel is protected by the API, not by being left out of here.
 */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/bag",
        "/wishlist",
        "/checkout",
        "/reset-password",
        "/track",
        "/monitoring",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
