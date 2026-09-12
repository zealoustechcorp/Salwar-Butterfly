import Image from "next/image";

/**
 * A picture in a frame whose shape the picture does not get to decide.
 *
 * Everything the shop uploads lands in one of two frames — 9:16 for a
 * customer story, 16:9 for a banner — and the frame is a fixed part of
 * the layout. What arrives to fill it is not fixed at all: a photograph
 * off a phone, a screenshot of a message, a flyer someone made in a
 * square. The frame wins: the picture is scaled until it covers the box
 * and whatever falls outside is cropped away.
 *
 * That is a deliberate trade. `contain` would keep every upload whole but
 * leaves bands down the sides of an off-ratio picture, and filling those
 * bands with a blown-up blurred copy of the picture — which is what this
 * did before — reads as a smear on every banner and story card that is
 * not already the frame's shape. Cropping costs the edges of an awkward
 * upload; the alternatives cost something on the whole page.
 *
 * The practical consequence for the shop: whatever matters in a banner or
 * a story photo — a face, a price, the text on a screenshot — wants to be
 * near the middle, because the edges are what a differently shaped frame
 * takes first.
 *
 * @param {object} props
 * @param {string} props.src
 * @param {string} props.alt
 * @param {string} [props.ratio]  the frame's aspect class — the caller's
 *                                decision, because it is a layout fact.
 *                                `h-full w-full` for a frame whose shape
 *                                is set by something outside it, such as
 *                                a slide in the carousel's track
 * @param {string} [props.sizes]
 * @param {boolean} [props.priority]
 * @param {"lazy"|"eager"} [props.loading]
 * @param {() => void} [props.onError]  fires when the picture cannot be loaded
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
        alt={alt}
        fill
        sizes={sizes}
        draggable={false}
        onError={onError}
        className="object-cover select-none"
        {...timing}
      />
    </div>
  );
}
