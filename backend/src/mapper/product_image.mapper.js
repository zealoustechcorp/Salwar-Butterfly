export const ProductImageMapper = {
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      productId: row.product_id,
      imageUrl: row.image_url,
      // The Cloudinary handle is returned deliberately: the admin gallery
      // has no use for it, but it is the only way to tell two rows of the
      // same photograph apart when diagnosing a duplicate upload.
      imagePublicId: row.image_public_id,
      altText: row.alt_text ?? null,
      position: Number(row.position ?? 0),
      // Position 0 is the cover. Derived rather than stored, so it cannot
      // drift out of step with the ordering.
      isPrimary: Number(row.position ?? 0) === 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => ProductImageMapper.toDTO(row));
  },

  /**
   * Galleries keyed by product id — what the product list needs to draw a
   * thumbnail per row without a request per product.
   */
  toGalleries(rows = []) {
    const galleries = {};

    for (const row of rows) {
      (galleries[row.product_id] ||= []).push(ProductImageMapper.toDTO(row));
    }

    return galleries;
  },

  /**
   * The gallery as it arrives embedded in a product row — already JSON,
   * already ordered, built by the lateral join in ProductRepository.
   *
   * Same output shape as `toDTO`, so a product's `images` look identical
   * whether they came from the product endpoints or the image ones.
   */
  fromProductRow(images) {
    if (!Array.isArray(images)) return [];

    return images.map((image) => ({
      id: image.id,
      productId: image.productId,
      imageUrl: image.imageUrl,
      imagePublicId: image.imagePublicId,
      altText: image.altText ?? null,
      position: Number(image.position ?? 0),
      isPrimary: Number(image.position ?? 0) === 0,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    }));
  },
};
