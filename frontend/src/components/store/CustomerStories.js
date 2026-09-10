import Image from "next/image";
import Link from "next/link";

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
 * A card is a photograph, or some words, or both. There is no `type`
 * field deciding which; the card is assembled from whichever of the two
 * the story carries, which is the same rule the CHECK constraint in the
 * database enforces.
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
            <StoryCard
              key={`${story.image ?? story.body}-${index}`}
              story={story}
              index={index}
            />
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

  const card = (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-sb-gold/35 bg-sb-bg transition-shadow group-hover:shadow-lg group-hover:shadow-sb-maroon-deco/10">
      {image ? (
        <div className="relative aspect-4/5 shrink-0 bg-sb-surface/40">
          <Image
            src={image}
            alt={altFor(name, product)}
            fill
            // Fixed frame and `object-cover`, because what arrives here is a
            // mix of full-length photographs and screenshots of messages. A
            // rail whose cards were each their own shape would read as a
            // layout accident rather than as a set.
            className="object-cover"
            sizes="(min-width: 640px) 18rem, 16rem"
            loading={index < 3 ? undefined : "lazy"}
          />
        </div>
      ) : null}

      {body || name ? (
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          {body ? (
            <p className="text-sm leading-relaxed text-sb-text">
              {/* Typographic quotes around the shop's transcription, so a
                  card that is words alone still reads as somebody speaking
                  rather than as copy the shop wrote about itself. */}
              &ldquo;{body}&rdquo;
            </p>
          ) : null}

          {name ? (
            <p
              className={`text-xs font-semibold text-sb-heading ${body ? "mt-3" : ""}`}
            >
              {name}
            </p>
          ) : null}

          {product ? (
            <p className="mt-auto pt-3 text-[11px] text-sb-text-muted">
              on{" "}
              <span className="font-medium text-sb-link underline underline-offset-2">
                {product.name}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* A photograph with no words and a product behind it still needs to
          say where it goes, and the block above does not render. */}
      {product && !body && !name ? (
        <p className="p-3 text-[11px] text-sb-text-muted">
          on{" "}
          <span className="font-medium text-sb-link underline underline-offset-2">
            {product.name}
          </span>
        </p>
      ) : null}
    </article>
  );

  return (
    <li className="w-64 shrink-0 snap-start sm:w-72">
      {product ? (
        <Link href={`/product/${product.id}`} className="group block h-full">
          {card}
        </Link>
      ) : (
        <div className="h-full">{card}</div>
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
