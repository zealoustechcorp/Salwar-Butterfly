import Link from "next/link";

import { MediaFrame } from "./MediaFrame";
import { Butterfly } from "./Ornaments";

/**
 * What customers have sent the shop (F-06.08).
 *
 * The rail PolicySection's header says used to be here and was removed:
 * "the live shop publishes no review data, and inventing customer quotes
 * for a real business would be a lie on the page." That was right, and
 * it is why this section is built on a table with an admin screen behind
 * it rather than on an array in this file. Every card below is something
 * a real customer actually sent, published by the shop from
 * /admin/home/stories. If the shop has published none, this renders
 * nothing at all — no placeholder, no sample quote.
 *
 * Every card is a photograph, and some of them carry a name and
 * something the customer said. Words on their own are not publishable —
 * the column is NOT NULL as of migration 019 — because the rail is a row
 * of pictures, and a card with an empty frame in it reads as an image
 * that failed to load rather than as a quote.
 *
 * Every card is exactly 9:16 and nothing it contains can change that.
 * The picture does not set the height — MediaFrame fits it inside the
 * frame and fills what is left with a blurred copy of itself — and
 * neither does the caption, which is laid over the bottom of the picture
 * rather than stacked under it. A rail whose cards were each as tall as
 * their own contents is a rail that either crops the short ones or
 * leaves a band of dead colour under them, and both of those have been
 * tried here.
 *
 * A horizontal rail rather than a grid. The API serves up to two dozen
 * of these, and two dozen cards stacked into a grid is more home page
 * than the section is worth — a rail shows the first few, says by its
 * own overflow that there are more, and costs a fixed amount of height
 * however many the shop publishes. It is CSS scroll-snap and nothing
 * else: no client state, no JavaScript, and it scrolls with a trackpad,
 * a touch drag, or the keyboard once focus is inside it.
 */
export function CustomerStories({ stories = [] }) {
  if (!stories.length) return null;

  return (
    <section
      id="customers"
      className="scroll-mt-40 bg-sb-surface/25 wide:scroll-mt-28"
    >
      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
        <div className="text-center">
          <p className="sb-eyebrow flex items-center justify-center gap-2 text-[10px] text-sb-gold-text">
            <Butterfly className="size-5 text-sb-maroon-deco" />
            From Our Customers
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            Worn, and sent back to us
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
            Photographs and messages customers have shared with the shop, published
            with their permission.
          </p>
        </div>
      </div>

      {/* Full-bleed rather than inside the max-width container: a rail that
          ends at the container edge looks like it has nothing more in it,
          while one that runs off the side of the screen says otherwise. The
          padding matches the container so the first card still lines up with
          the heading above it. */}
      <div className="-mt-2 overflow-x-auto pb-10 sm:pb-12 lg:pb-14">
        <ul className="flex snap-x snap-mandatory gap-4 px-4 sm:gap-5 sm:px-6 lg:px-8">
          {stories.map((story, index) => (
            <StoryCard key={story.image} story={story} index={index} />
          ))}

          {/* A tail spacer, so the last card can scroll clear of the screen
              edge instead of ending flush against it. */}
          <li aria-hidden="true" className="w-0 shrink-0 sm:w-2" />
        </ul>
      </div>
    </section>
  );
}

/**
 * One card.
 *
 * Wrapped in a link only when the story names a piece that is still on
 * sale — the API has already collapsed "names nothing" and "names
 * something withdrawn" into `product: null`, so there is one question
 * here rather than two.
 */
function StoryCard({ story, index }) {
  const { image, body, customer_name: name, product } = story;

  // Whether there is anything to print under the picture at all. Most
  // stories are a photograph and nothing else, so this is false more
  // often than not.
  const caption = Boolean(body || name || product);

  const card = (
    <article className="relative overflow-hidden rounded-2xl border border-sb-gold/35 transition-shadow group-hover:shadow-lg group-hover:shadow-sb-maroon-deco/10">
      <MediaFrame
        src={image}
        alt={altFor(name, product)}
        ratio="aspect-9/16"
        sizes="(min-width: 640px) 224px, 192px"
        loading={index < 3 ? "eager" : "lazy"}
      />

      {/* Over the picture, not under it. A caption in its own band below
          would make the card as tall as its words, which is the thing the
          fixed frame exists to prevent — and on a bare card that band is
          empty and shows as a slab of colour.

          The gradient is what makes white text legible over an arbitrary
          photograph. It fades rather than being a solid bar so that the
          bottom of the picture is dimmed instead of hidden. */}
      {caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/50 to-transparent p-4 pt-12">
          {body ? (
            <p className="text-sm leading-relaxed text-white">
              {/* Typographic quotes around the shop's transcription, so the
                  words read as somebody speaking rather than as copy the
                  shop wrote about itself. */}
              &ldquo;{body}&rdquo;
            </p>
          ) : null}

          {name ? (
            <p className={`text-xs font-semibold text-white ${body ? "mt-2" : ""}`}>
              {name}
            </p>
          ) : null}

          {product ? (
            <p className={`text-[11px] text-white/75 ${body || name ? "mt-2" : ""}`}>
              on{" "}
              <span className="font-medium text-white underline underline-offset-2">
                {product.name}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );

  return (
    <li className="w-48 shrink-0 snap-start sm:w-56">
      {product ? (
        <Link href={`/product/${product.id}`} className="group block">
          {card}
        </Link>
      ) : (
        card
      )}
    </li>
  );
}

/**
 * What a screen reader is told about a customer's photograph.
 *
 * Never empty, unlike the banners: a banner is decoration beside a
 * headline that says the same thing, while this image *is* the content
 * of its card and there may be no text next to it at all. Named where
 * the shop recorded a name, and tied to the piece where it recorded one,
 * because "photo sent by a customer" twelve times in a row tells a
 * screen-reader user nothing about which card they are on.
 */
function altFor(name, product) {
  const who = name ? name : "a customer";

  return product
    ? `Photograph sent by ${who}, wearing ${product.name}`
    : `Photograph sent by ${who}`;
}
