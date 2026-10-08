export class CreateSubCategoryDTO {
  constructor({ name, categoryId, isActive = true } = {}) {
    this.name = typeof name === "string" ? name.trim() : name;
    this.categoryId = categoryId;
    this.isActive = isActive;
  }
}

export class UpdateSubCategoryDTO {
  constructor({ name, categoryId, isActive } = {}) {
    if (name !== undefined) {
      this.name = typeof name === "string" ? name.trim() : name;
    }

    if (categoryId !== undefined) {
      this.categoryId = categoryId;
    }

    if (isActive !== undefined) {
      this.isActive = isActive;
    }
  }
}
