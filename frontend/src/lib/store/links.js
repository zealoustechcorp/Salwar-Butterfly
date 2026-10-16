/**
 * The address of a product's page: /product/<slug>.
 *
 * Every product has a slug — the column is NOT NULL and unique — so one
 * arriving here without it means the data feeding this link dropped the
 * field: a backend still running code from before slugs were served, or a
 * new endpoint whose shape leaves it out. That used to fall back to the id
 * silently, which is how UUIDs went on showing in the address bar with
 * nothing to say why.
 *
 * Now it is loud in development — console.error, which Next's dev overlay
 * surfaces — and still a working link in production, where the id route
 * redirects to the slug. A shopper should never pay for a missing field
 * with a dead link.
 *
 * Kept out of catalogue.js because client components link to products too,
 * and that module is the server-side read model.
 *
 * @param {{ slug?: string, id?: string }} product
 * @returns {string}
 */
export function productPath(product) {
  if (product?.slug) return `/product/${encodeURIComponent(product.slug)}`;

  if (process.env.NODE_ENV !== "production") {
    console.error(
      `[productPath] product ${product?.id ?? "(no id)"} has no slug — ` +
        "linking by id. Whatever supplied this product is not sending its " +
        "slug; restart the backend if it predates slug URLs.",
    );
  }

  return `/product/${encodeURIComponent(product?.id ?? "")}`;
}
