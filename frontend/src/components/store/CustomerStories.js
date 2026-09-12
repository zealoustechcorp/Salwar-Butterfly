"use client";

import Link from "next/link";
import { useState } from "react";

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
 * the column is NOT NULL as of migration 019 — because the section is a
 * wall of pictures, and a card with an empty frame in it reads as an
 * image that failed to load rather than as a quote.
 *
 * A STAGGERED WALL, AT EVERY WIDTH. This used to be a horizontal rail
 * that was swiped sideways, and on a phone it still could be — but a
 * rail on a phone is a section most visitors never see past the second
 * card, and it fights the page it sits in, because a sideways scroller
 * inside a vertical scroller eats any drag that is not quite straight.
 * Photographs real customers sent in are worth more than that. So it is
 * two columns on a phone, three from `sm`, four from `lg`, and the only
 * gesture involved is the one already being used to read the page.
 *
 * The layout is CSS multi-column and nothing else: no measuring, no
 * resize listener, no absolute positioning. Cards fill down one column
 * and on to the next, so the order the shop set in /admin/home/stories
 * reads top-to-bottom per column rather than across rows — which is how
 * every wall of this shape behaves, Keep and Pinterest included.
 *
 * WHY THE HEIGHTS VARY. A wall of identical 9:16 tiles reads as a
 * contact sheet — regular enough that the eye takes it in as one texture
 * and stops looking at the individual photographs. Staggering the
 * heights breaks that up, which is the whole point of the layout.
 *
 * The heights come from a fixed pattern rather than from the pictures
 * (see RATIOS), so every slot is reserved at its final size before a
 * single image has loaded. Nothing on this page moves while it fills in.
 * MediaFrame is what makes that affordable: whatever shape the shop
 * actually uploaded, it is fitted inside the frame and the space around
 * it filled with a blurred copy of itself, so a portrait photograph in a
 * square slot is neither cropped nor sat in a band of dead colour.
 *
 * Captions stay laid over the bottom of the picture rather than stacked
 * under it. A card as tall as its own words is a card whose height the
 * pattern does not control, and one long quote would then drag a column
 * out of step with the rest.
 */
export function CustomerStories({ stories = [] }) {
  // The wall starts capped (see the two limits below) and this opens it.
  // It is the only state in the section.
  const [expanded, setExpanded] = useState(false);

  if (!stories.length) return null;

  // Whether anything is being held back, asked separately per width
  // because the cap is not the same at both. Between five and nine
  // published stories, the phone is hiding some and the desktop is not,
  // so the button belongs on one and not the other.
  const cappedSmall = stories.length > SMALL_LIMIT;
  const cappedWide = stories.length > WIDE_LIMIT;

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

      <div className="-mt-2 pb-10 sm:pb-12 lg:pb-14">
        {/* The column count steps with the width, and the cap steps with
            it at the same breakpoint (see WIDE_LIMIT) — otherwise a
            four-card cap lands in a three-column wall and the last row
            comes out as one card and two holes. */}
        <ul className="mx-auto max-w-7xl columns-2 gap-4 px-4 sm:columns-3 sm:gap-5 sm:px-6 lg:columns-4 lg:px-8">
          {stories.map((story, index) => (
            <StoryCard
              key={story.image}
              story={story}
              index={index}
              hiddenClass={expanded ? "" : hiddenAbove(index)}
            />
          ))}
        </ul>

        {/* Only when the wall is actually holding something back — and
            only at the widths where it is. The label carries the total
            rather than the remainder because the remainder is a
            different number on a phone than on a desktop, and one
            string that is true at every width beats two spans and a
            pair of guards. */}
        {cappedSmall ? (
          <div className={`pt-8 text-center ${cappedWide ? "" : "sm:hidden"}`}>
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-sb-gold/50 px-5 py-2.5 text-sm font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40"
            >
              {expanded
                ? "Show fewer"
                : `Show all ${stories.length} photographs`}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * How many cards the wall shows before the button.
 *
 * Four below `sm`: two rows of two, about 460px on a 390px-wide phone.
 * The section that used to live here was a rail precisely because a rail
 * costs a fixed amount of height however many stories the shop
 * publishes, and a wall gives that up — so the cap is what buys it back.
 * This is a home page that already carries a hero, the categories, the
 * products, the offer banner and the shop's own story, and a wall of
 * nine on a phone is most of a screen and a half of it.
 *
 * Nine from `sm` up: three full rows at three columns and a little over
 * two at four. Enough that the stagger reads as a wall rather than as a
 * row that came out uneven, and few enough that the section is still one
 * part of the page rather than the end of it. The API serves up to two
 * dozen, and two dozen photographs unrolled by default is more home page
 * than this section is worth.
 */
const SMALL_LIMIT = 4;
const WIDE_LIMIT = 9;

/**
 * Which widths a given card is hidden at while the wall is capped.
 *
 * Returned as classes rather than applied by slicing the array, because
 * the two caps differ and one list cannot be sliced two ways at once. It
 * is also the better answer for a screen reader: a card that is
 * `display: none` is out of the accessibility tree and out of the tab
 * order, so a visitor is told about exactly the cards a sighted visitor
 * at the same width can see, and the button adds the rest for both.
 */
function hiddenAbove(index) {
  if (index < SMALL_LIMIT) return "";

  // Hidden on a phone, shown once the wall widens and the cap rises.
  if (index < WIDE_LIMIT) return "hidden sm:block";

  // Past both caps: hidden everywhere until the button is pressed.
  return "hidden";
}

/**
 * The heights the wall cycles through.
 *
 * Five of them, against two columns on a phone, three at `sm` and four
 * at `lg`. That is on purpose: a pattern as long as the column count
 * would hand every column the same run of shapes and the wall would come
 * out in neat rows, which is the thing it exists to avoid. Five divides
 * evenly into none of the three, so the shapes keep falling in a
 * different place down each column at every width.
 *
 * Written out as whole class names rather than built from a template,
 * because Tailwind finds classes by reading this file as text and
 * `aspect-${x}` is not a class name to it.
 */
const RATIOS = [
  "aspect-3/4",
  "aspect-9/16",
  "aspect-square",
  "aspect-4/5",
  "aspect-9/16",
];

/**
 * One card.
 *
 * Wrapped in a link only when the story names a piece that is still on
 * sale — the API has already collapsed "names nothing" and "names
 * something withdrawn" into `product: null`, so there is one question
 * here rather than two.
 */
function StoryCard({ story, index, hiddenClass }) {
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
        ratio={RATIOS[index % RATIOS.length]}
        sizes="(min-width: 1024px) 300px, (min-width: 768px) 240px, (min-width: 640px) 190px, 46vw"
        // Four rather than three: two columns means the first four cards
        // are the first two rows, and on a phone that is what is on
        // screen when the section is reached.
        loading={index < 4 ? "eager" : "lazy"}
      />

      {/* Over the picture, not under it. A caption in its own band below
          would make the card as tall as its words, which is the thing the
          fixed frame exists to prevent — and on a bare card that band is
          empty and shows as a slab of colour.

          The gradient is what makes white text legible over an arbitrary
          photograph. It fades rather than being a solid bar so that the
          bottom of the picture is dimmed instead of hidden. */}
      {caption ? (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/50 to-transparent p-3 pt-10 sm:p-4 sm:pt-12">
          {body ? (
            // Clamped on a phone only. A column there is about 170px
            // wide, so a quote of any length runs to five or six lines
            // and covers the photograph it is supposed to be a caption
            // for — worst on a square card, which is barely taller than
            // the text. From `sm` the cards are wide enough that the
            // quote is a couple of lines and can run in full.
            <p className="line-clamp-3 text-xs leading-relaxed text-white sm:line-clamp-none sm:text-sm">
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
    <li className={`mb-4 break-inside-avoid sm:mb-5 ${hiddenClass}`}>
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
