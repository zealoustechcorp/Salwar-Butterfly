// src/config/attribute.groups.js
//
// One name for the colour group, because three layers need to agree on
// it and a typo in any of them would be silent.
//
// `product_attribute_values` is keyed by a free-form `group_name`, and
// almost every group behaves identically: the register curates a
// vocabulary, `products.attributes` records which value a product
// carries, and nothing else cares. Colour is the one exception — it is
// carried by `product_variants.colour`, not by the product — so three
// places have to special-case it:
//
//   product_variant.repository   joins the register to read a swatch
//   attribute_value.repository   counts usage from variants, not products
//   attribute_value.service      a rename must rewrite the variants too
//
// Spelled British throughout, matching the column and the rest of the
// catalogue's prose.

export const COLOUR_GROUP = "colour";

/**
 * The key under which a product records how it is cut.
 *
 * Stored in `products.attributes` like fabric and work — one value per
 * product — but its vocabulary does NOT come from
 * `product_attribute_values`. It comes from `size_charts.fit`, which is
 * already the shop's list of the fits it cuts, one row per fit, UNIQUE
 * on the name.
 *
 * That is the whole point of recording it: the storefront prints the
 * chart whose `fit` equals this value, so a product carrying a fit no
 * chart is published for would be a product whose size guide silently
 * falls back to every chart the shop has. Registering the same names a
 * second time in the register would give two tables owning one
 * vocabulary, and "Normal" against "Normal Fit" is exactly the drift
 * that would follow.
 *
 * So the service resolves this value against `size_charts` on every
 * write, and stores the chart's own spelling of it — see
 * ProductService.resolveFit.
 */
export const FIT_GROUP = "fit";

/**
 * Whether a group's values are chosen per variant rather than per
 * product. Colour is the only one today; the check exists so adding a
 * second is a one-line change here rather than a hunt through the layers
 * above.
 */
export const isVariantGroup = (groupName) => groupName === COLOUR_GROUP;

/**
 * Whether a group is curated in `product_attribute_values`.
 *
 * Everything but the fit is. The attribute-value endpoints use this to
 * refuse a "fit" row rather than let one be registered next to the
 * charts that already define the list.
 */
export const isRegisterGroup = (groupName) => groupName !== FIT_GROUP;
