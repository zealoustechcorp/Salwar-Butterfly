/**
 * `colour` is the empty string, never null, because that is how the
 * column stores "not sold by colour" — see migration 015. A caller that
 * omits it gets a colourless variant, which is what every variant
 * written before colour existed already is.
 */
export class CreateProductVariantDTO {
  constructor({ productId, size, colour = "", stockQuantity = 0, active = true } = {}) {
    this.productId = productId;
    this.size = typeof size === "string" ? size.trim() : size;
    this.colour = typeof colour === "string" ? colour.trim() : "";
    this.stockQuantity = stockQuantity;
    this.active = active;
  }
}

export class UpdateProductVariantDTO {
  constructor({ size, colour, stockQuantity, active } = {}) {
    if (size !== undefined)
      this.size = typeof size === "string" ? size.trim() : size;
    // Clearing a colour is a real edit — "sold by colour" becoming "not
    // sold by colour" — so null and "" both mean the empty sentinel
    // rather than "leave it alone". Only `undefined` skips the field.
    if (colour !== undefined)
      this.colour = typeof colour === "string" ? colour.trim() : "";
    if (stockQuantity !== undefined) this.stockQuantity = stockQuantity;
    if (active !== undefined) this.active = active;
  }
}
