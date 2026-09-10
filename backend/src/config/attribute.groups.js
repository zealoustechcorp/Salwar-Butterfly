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
 * Whether a group's values are chosen per variant rather than per
 * product. Colour is the only one today; the check exists so adding a
 * second (a per-variant "fit", say) is a one-line change here rather
 * than a hunt through the layers above.
 */
export const isVariantGroup = (groupName) => groupName === COLOUR_GROUP;
