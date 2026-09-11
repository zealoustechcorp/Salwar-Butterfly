"use client";

/**
 * The admin-side twin of components/store/MediaFrame.js.
 *
 * Same two layers and the same reasoning — a picture fitted inside a
 * fixed frame, with a blown-up blurred copy of itself filling whatever
 * it does not cover — so that what the shop is looking at on this screen
 * is what a visitor will see on the storefront. A preview that cropped
 * differently from the real thing would be worse than no preview.
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
        alt=""
        aria-hidden="true"
        loading="lazy"
        draggable={false}
        className="absolute inset-0 size-full scale-110 object-cover blur-lg select-none"
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        className="relative size-full object-contain select-none"
      />
    </div>
  );
}
