/**
 * Which sellable row a shopper's choice resolves to.
 *
 * Colour is the admin's choice per product. A product with no colours is
 * sold by size alone and every size row in `product.sizes` carries the id
 * checkout orders against. A product with colours is sold by (size,
 * colour), and only `product.variants` holds ids that mean that — the
 * per-size rows are folded across colourways and their id is one
 * arbitrary colour's shelf (see storefront.repository.js).
 *
 * Kept in one place because three screens have to agree on it: the detail
 * page that offers the choice, the bag that holds it, and the stock sync
 * that re-reads it. A bag line resolved one way and synced another would
 * show one colour's count against another colour's id.
 */

/** Whether this product asks the shopper for a colour at all. */
export function soldByColour(product) {
  return (product?.colours?.length ?? 0) > 0;
}

/**
 * The row for one choice: `{ variant_id, size, stock, colour? }`, or null.
 *
 * `colour` is ignored for a product not sold by colour. For one that is,
 * a missing colour resolves to nothing rather than to a guess — the bag
 * line it would create would be ordered against a colour nobody picked.
 */
export function variantFor(product, size, colour) {
  if (!product || !size) return null;

  if (!soldByColour(product)) {
    return product.sizes?.find((row) => row.size === size) ?? null;
  }

  if (!colour) return null;

  return (
    product.variants?.find((row) => row.size === size && row.colour === colour) ?? null
  );
}

/** The sizes one colourway is sold in, in the shop's order, each with its own count. */
export function sizesInColour(product, colour) {
  return (product?.variants ?? []).filter((row) => row.colour === colour);
}

/** Everything left of one colourway, across its sizes. */
export function colourStock(product, colour) {
  return sizesInColour(product, colour).reduce((sum, row) => sum + Math.max(0, row.stock), 0);
}

/**
 * The bag key for a choice.
 *
 * A line without a colour keeps the key it always had, so a bag saved on a
 * device before colours were offered still matches its lines.
 */
export function lineKey(productId, size, colour) {
  return colour ? `${productId}:${size ?? "-"}:${colour}` : `${productId}:${size ?? "-"}`;
}

/** "Maroon · size 40", "size 40", or "Maroon" — for toasts and bag lines. */
export function describeChoice(size, colour) {
  return [colour || null, size ? `size ${size}` : null].filter(Boolean).join(" · ");
}
