import { unstable_rethrow } from "next/navigation";

import { getStorefrontProducts } from "@/lib/store/catalogue";

/**
 * `/search-index` — the pieces the header search can suggest, as JSON.
 *
 * Fetched by the browser the first time a shopper focuses the search box
 * (see loadSearchIndex in lib/store/searchSuggest.js), not sent with every
 * page: most visits never search, and the bag and checkout should not carry
 * a product list.
 *
 * Static and revalidated on the catalogue's own minute, so it is served from
 * the CDN like a file — a visitor opening the search box runs no function
 * and costs the API nothing. Only what a suggestion row draws and what the
 * grid's search matches on (see `searchText` in lib/store/filters.js) is
 * sent; no stock counts, no variant ids.
 */

export const revalidate = 60;

export async function GET() {
  try {
    const products = await getStorefrontProducts();

    return Response.json(
      products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        mrp: p.mrp ?? null,
        image: p.image ?? null,
        category_name: p.category_name,
        fabric: p.fabric,
        fit: p.fit,
        piece_code: p.piece_code,
        available_sizes: p.available_sizes,
        colours: (p.colours ?? []).map((colour) => ({ name: colour.name })),
        in_stock: p.in_stock,
      })),
    );
  } catch (error) {
    // Let Next's own "render this on request" signal through (thrown during
    // a build that cannot reach the API) instead of answering 503 for it.
    unstable_rethrow(error);
    console.warn(`[search-index] ${error.message}`);
    // The dropdown degrades to collections and fabrics without pieces; the
    // short max-age lets the next visitor try again soon.
    return Response.json([], {
      status: 503,
      headers: { "Cache-Control": "public, max-age=30" },
    });
  }
}
