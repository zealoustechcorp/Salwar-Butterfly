export class UpdateProductImageDTO {
  constructor({ altText } = {}) {
    if (altText !== undefined) {
      this.altText =
        typeof altText === "string" ? altText.trim() || null : (altText ?? null);
    }
  }
}
