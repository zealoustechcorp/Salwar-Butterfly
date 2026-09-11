import Image from "next/image";

/**
 * A picture in a frame whose shape the picture does not get to decide.
 *
 * Everything the shop uploads lands in one of two frames — 9:16 for a
 * customer story, 16:9 for a banner — and the frame is a fixed part of
 * the layout. What arrives to fill it is not fixed at all: a photograph
 * off a phone, a screenshot of a message, a flyer someone made in a
 * square. Three ways to reconcile that, and this is the third:
 *
 *   cover     crops. A 16:9 flyer in a 9:16 frame loses most of itself,
 *             and whatever the shop actually wanted read — a face, a
 *             price, the text on a screenshot — is what goes first.
 *   contain   fits, and leaves bars. Honest, but the bars are a flat
 *             slab of card colour, which is the band that made the rail
 *             look broken.
 *   this      fits *and* fills: the picture is contained, and behind it
 *             the same picture is blown up, cropped and blurred until it
 *             is texture rather than content. Nothing is cropped away
 *             and there is no dead colour — the frame is full edge to
 *             edge, in the picture's own palette.
 *
 * An image that already matches the frame covers it exactly and the
 * backdrop is never seen. So this costs nothing in the ordinary case and
 * rescues the awkward one, which is why it is unconditional rather than
 * something the shop has to think about per upload.
 *
 * The backdrop is `aria-hidden` and carries an empty alt: it is the same
 * picture as the one in front of it, and announcing it twice tells a
 * screen-reader user there are two images here when there is one.
 *
 * `scale-110` on the backdrop matters more than it looks. A blur samples
 * beyond the element's edges, so an unscaled backdrop fades to
 * transparent in a band around the frame and the dead colour comes back
 * — in a thin line instead of a slab.
 *
 * @param {object} props
 * @param {string} props.src
 * @param {string} props.alt      describes the picture; the backdrop takes ""
 * @param {string} [props.ratio]  the frame's aspect class — the caller's
 *                                decision, because it is a layout fact.
 *                                `h-full w-full` for a frame whose shape
 *                                is set by something outside it, such as
 *                                a slide in the carousel's track
 * @param {string} [props.sizes]  passed to both layers, so they resolve to
 *                                one optimised URL and one network fetch
 * @param {boolean} [props.priority]
 * @param {"lazy"|"eager"} [props.loading]
 * @param {() => void} [props.onError]  fires when the picture cannot be
 *                                loaded. Wired to the foreground only —
 *                                it is the same file, so a backdrop that
 *                                failed would report the same loss twice
 * @param {string} [props.className] extra classes on the frame itself
 */
export function MediaFrame({
  src,
  alt,
  ratio = "aspect-9/16",
  sizes,
  priority = false,
  loading,
  onError,
  className = "",
}) {
  // next/image rejects `loading` alongside `priority` — the first is
  // already implied by the second.
  const timing = priority ? { priority: true } : loading ? { loading } : {};

  return (
    <div className={`relative overflow-hidden ${ratio} ${className}`}>
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        sizes={sizes}
        draggable={false}
        className="scale-110 object-cover blur-xl select-none"
        {...timing}
      />

      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        draggable={false}
        onError={onError}
        className="relative object-contain select-none"
        {...timing}
      />
    </div>
  );
}
