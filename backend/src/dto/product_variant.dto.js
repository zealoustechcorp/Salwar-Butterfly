export class CreateProductVariantDTO {
  constructor({ productId, size, stockQuantity = 0, active = true } = {}) {
    this.productId = productId;
    this.size = typeof size === "string" ? size.trim() : size;
    this.stockQuantity = stockQuantity;
    this.active = active;
  }
}

export class UpdateProductVariantDTO {
  constructor({ size, stockQuantity, active } = {}) {
    if (size !== undefined)
      this.size = typeof size === "string" ? size.trim() : size;
    if (stockQuantity !== undefined) this.stockQuantity = stockQuantity;
    if (active !== undefined) this.active = active;
  }
}
