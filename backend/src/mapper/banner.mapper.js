// src/mapper/banner.mapper.js
//
// The home page carousel (F-06).
//
// Two shapes, for two readers, and the difference is the point of the
// file.
//
//   toDTO     the admin screen. Carries the id, the position, the active
//             flag and the timestamps — everything the screen needs to
//             list, reorder, hide and delete a slide.
//
//   toPublic  the storefront. Carries the image URL and nothing else.
//
// The public shape is one field, and it is worth saying why it is a
// mapper rather than a `rows.map(r => r.image)` in the service. The
// three fields it drops are the three a public reader must not have:
// `id` invites a client to start sending it back, `active` would tell an
// anonymous reader how many banners the shop has taken down, and
// `image_public_id` is the handle that deletes the file off Cloudinary.
// That last one is not a leak of taste — it is the destructive key,
// printed on an endpoint with no token in front of it.

export const BannerMapper = {
  /** One banner, as the admin screen manages it. */
  toDTO(row) {
    if (!row) return null;

    return {
      id: row.id,

      image: row.image,
      imagePublicId: row.image_public_id,

      position: Number(row.position),
      active: Boolean(row.active),

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => BannerMapper.toDTO(row));
  },

  /**
   * One slide, as the home page renders it.
   *
   * An object rather than a bare string, even holding one field. The
   * carousel keys its slides and its dots by what this returns, and a
   * shape with a name on it is what lets a second field arrive later
   * without every caller changing at once.
   */
  toPublic(row) {
    if (!row) return null;

    return {
      image: row.image,
    };
  },

  toPublicList(rows = []) {
    return rows.map((row) => BannerMapper.toPublic(row));
  },
};
