"use client";

/**
 * The admin-side twin of components/store/MediaFrame.js.
 *
 * Same single layer and the same reasoning — the picture is scaled until
 * it covers the frame and the overflow is cropped — so that what the shop
 * is looking at on this screen is what a visitor will see on the
 * storefront. A preview that cropped differently from the real thing
 * would be worse than no preview.
 *
 * A plain `img` rather than `next/image`, for the reason
 * GalleryThumbnail gives: these are thumbnails on a screen behind a
 * login, the source is an arbitrary Cloudinary account, and some of them
 * are `blob:` previews the optimizer cannot fetch.
 *
 * @param {object} props
 * @param {string} props.src
 * @param {string} [props.alt]    "" for a decorative preview, which is
 *                                what every caller here passes: the row
 *                                beside it already names the thing
 * @param {string} [props.ratio]  the frame's aspect class. 16:9 for a
 *                                banner, 9:16 for a customer story —
 *                                matching the storefront exactly
 * @param {string} [props.className]
 */
export function MediaFrame({ src, alt = "", ratio = "aspect-9/16", className = "" }) {
  return (
    <div className={`relative overflow-hidden bg-ink-100 ${ratio} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        className="size-full object-cover select-none"
      />
    </div>
  );
}
