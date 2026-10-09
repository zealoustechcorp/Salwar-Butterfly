import {
  getFabrics,
  getStorefrontCategories,
  getStorefrontProducts,
} from "@/lib/store/catalogue";
import { filterProducts } from "@/lib/store/filters";

/**
 * Where an address from the shop's previous site should land now.
 *
 * salwarbutterfly.in used to be a hosted store with `/collections/<handle>`
 * and `/products/<handle>` URLs, and search engines still hold them — Google
 * shows them as sitelinks under the home page. This app has neither route,
 * so without this every one of those links is a 404.
 *
 * Nothing records how the old handles map onto today's catalogue (the old
 * collections were mostly fabrics and prints — "kanchi-cotton-salwar",
 * "floral-salwar" — while today's categories are cuts), so the handle is
 * matched against what the shop sells now, most specific first:
 *
 *   1. a product whose name spells the same handle    → /product/<id>
 *   2. a fabric named in the handle                   → /shop?fabric=<name>
 *   3. a category with the same name                  → /shop?category=<id>
 *   4. the handle's words as a search, if it finds any → /shop?q=<words>
 *   5. otherwise                                      → /shop
 *
 * Step 4 only redirects to a search that has results: an old link opening on
 * "nothing matches" reads as a broken shop, and the whole shelf does not.
 */

/** "Women's Cotton – Floral" → "women-s-cotton-floral", the shape handles take. */
function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Words of a slug with a plural "s" dropped, so "salwars" meets "salwar". */
function stems(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word));
}

// Words every old handle is padded with. They match half the catalogue, so
// leaving them in a search narrows nothing, and leaving them out of one that
// would otherwise come back empty is what lets the rest of the handle find
// something.
const FILLER = new Set([
  "all",
  "collection",
  "collections",
  "for",
  "salwar",
  "salwars",
  "suit",
  "suits",
  "women",
  "womens",
]);

/**
 * @param {string} handle  the last path segment of the old URL
 * @param {{ products?: boolean }} [options] true when the old URL was a
 *        product page, so a product of the same name is tried first
 * @returns {Promise<string>} a path on this site
 */
export async function resolveLegacyHandle(handle, { products: tryProducts = false } = {}) {
  const slug = slugify(decodeURIComponent(handle ?? ""));
  if (!slug || slug === "all" || slug === "frontpage") return "/shop";

  let products;
  try {
    products = await getStorefrontProducts();
  } catch {
    // The API is down. The shelf is still the right place to send them.
    return "/shop";
  }

  if (tryProducts) {
    const product = products.find((p) => slugify(p.name) === slug);
    if (product) return `/product/${product.id}`;
  }

  const words = stems(slug);
  const has = (name) => stems(slugify(name)).every((word) => words.includes(word));

  // Longest first, so "south cotton" wins over a bare "cotton".
  const fabric = (await getFabrics(products))
    .map((f) => f.name)
    .sort((a, b) => b.length - a.length)
    .find(has);
  if (fabric) return `/shop?fabric=${encodeURIComponent(fabric)}`;

  const category = (await getStorefrontCategories(products)).find(
    (c) => stems(slugify(c.name)).join("-") === words.join("-"),
  );
  if (category) return `/shop?category=${encodeURIComponent(category.id)}`;

  const query = slug
    .split("-")
    .filter((word) => word && !FILLER.has(word))
    .join(" ");
  if (query && filterProducts(products, { query }).length) {
    return `/shop?q=${encodeURIComponent(query)}`;
  }

  return "/shop";
}
