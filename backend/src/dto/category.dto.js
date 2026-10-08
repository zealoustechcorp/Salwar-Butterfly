export class CreateCategoryDTO {
  constructor({
    name,
    slug,
    description = null,
    image = null,
    imagePublicId = null,
    fits = null,
    active = true,
  } = {}) {
    this.name = typeof name === "string" ? name.trim() : name;
    this.slug = typeof slug === "string" ? slug.trim().toLowerCase() : slug;
    this.description =
      typeof description === "string" ? description.trim() : description;
    this.image = typeof image === "string" ? image.trim() : image;
    this.imagePublicId =
      typeof imagePublicId === "string" ? imagePublicId.trim() : imagePublicId;

    if (fits) {
      if (typeof fits === "string") {
        try {
          this.fits = JSON.parse(fits);
        } catch {
          this.fits = null;
        }
      } else if (typeof fits === "object" && fits !== null) {
        this.fits = fits;
      } else {
        this.fits = null;
      }
    } else {
      this.fits = null;
    }

    this.active = active;
  }
}

export class UpdateCategoryDTO {
  constructor({
    name,
    slug,
    description,
    image,
    imagePublicId,
    fits,
    active,
  } = {}) {
    if (name !== undefined) {
      this.name = typeof name === "string" ? name.trim() : name;
    }

    if (slug !== undefined) {
      this.slug = typeof slug === "string" ? slug.trim().toLowerCase() : slug;
    }

    if (description !== undefined) {
      this.description =
        typeof description === "string" ? description.trim() : description;
    }

    if (image !== undefined) {
      this.image = typeof image === "string" ? image.trim() : image;
    }

    if (imagePublicId !== undefined) {
      this.imagePublicId =
        typeof imagePublicId === "string"
          ? imagePublicId.trim()
          : imagePublicId;
    }

    if (fits !== undefined) {
      if (fits) {
        if (typeof fits === "string") {
          try {
            this.fits = JSON.parse(fits);
          } catch {
            this.fits = null;
          }
        } else if (typeof fits === "object" && fits !== null) {
          this.fits = fits;
        } else {
          this.fits = null;
        }
      } else {
        this.fits = null;
      }
    }

    if (active !== undefined) {
      this.active = active;
    }
  }
}
