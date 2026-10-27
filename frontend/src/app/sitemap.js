import { unstable_rethrow } from "next/navigation";

import { getProductSlugs } from "@/lib/store/catalogue";
import { productPath } from "@/lib/store/links";
import { SITE_URL } from "@/lib/site";

/**
 * sitemap.xml — the public pages, then one entry per product.
 *
 * Products come from the same cached catalogue read the shop grid uses, so
 * a piece added in the admin appears here on the next revalidation, like it
 * does everywhere else.
 *
 * If the API cannot be reached the sitemap still renders with the static
 * pages, for the same reason generateStaticParams on the product route
 * swallows that failure: a backend that is down should cost a thinner
 * sitemap, not a failed deploy.
 */
export default async function sitemap() {
  const pages = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/returns`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let productSlugs = [];

  try {
    productSlugs = await getProductSlugs();
  } catch (error) {
    // A build that cannot reach the API renders the sitemap on request
    // instead (see loadCatalogue); that signal must not be swallowed here.
    unstable_rethrow(error);
    console.warn(`[sitemap] could not list products: ${error.message}`);
  }

  return [
    ...pages,
    ...productSlugs.map((slug) => ({
      url: `${SITE_URL}${productPath({ slug })}`,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}
