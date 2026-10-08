export class CreateProductImageDTO {
  constructor({ productId, imageUrl, imagePublicId, altText = null, position = 0 } = {}) {
    this.productId =
      typeof productId === "string" ? productId.trim() : productId;
    this.imageUrl = imageUrl;
    this.imagePublicId = imagePublicId;
    this.altText =
      typeof altText === "string" ? altText.trim() || null : (altText ?? null);
    this.position = position;
  }
}

export class UpdateProductImageDTO {
  constructor({ altText } = {}) {
    if (altText !== undefined) {
      this.altText =
        typeof altText === "string" ? altText.trim() || null : (altText ?? null);
    }
  }
}
