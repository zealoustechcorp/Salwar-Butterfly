export class CreateProductDTO {
  constructor({
    name,
    slug,
    description = null,
    categoryId,
    subCategoryId = null,
    basePrice,
    discountPercentage = 0,
    currentPrice,
    isFeatured = false,
    active = true,
  } = {}) {
    this.name = typeof name === "string" ? name.trim() : name;
    this.slug = typeof slug === "string" ? slug.trim().toLowerCase() : slug;
    this.description =
      typeof description === "string" ? description.trim() : description;
    this.categoryId = categoryId;
    this.subCategoryId = subCategoryId;
    this.basePrice = basePrice;
    this.discountPercentage = discountPercentage;
    this.currentPrice = currentPrice;
    this.isFeatured = isFeatured;
    this.active = active;
  }
}

export class UpdateProductDTO {
  constructor({
    name,
    slug,
    description,
    subCategoryId,
    basePrice,
    discountPercentage,
    currentPrice,
    isFeatured,
    active,
  } = {}) {
    if (name !== undefined)
      this.name = typeof name === "string" ? name.trim() : name;
    if (slug !== undefined)
      this.slug = typeof slug === "string" ? slug.trim().toLowerCase() : slug;
    if (description !== undefined)
      this.description =
        typeof description === "string" ? description.trim() : description;
    if (subCategoryId !== undefined) this.subCategoryId = subCategoryId;
    if (basePrice !== undefined) this.basePrice = basePrice;
    if (discountPercentage !== undefined)
      this.discountPercentage = discountPercentage;
    if (currentPrice !== undefined) this.currentPrice = currentPrice;
    if (isFeatured !== undefined) this.isFeatured = isFeatured;
    if (active !== undefined) this.active = active;
  }
}
