"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { productPath } from "@/lib/store/links";
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
 * LAYOUT BY WIDTH.
 *
 * Below `sm` (phones): a horizontal scrolling rail with snap points.
 * All stories are reachable by swiping sideways, a gesture that costs
 * no vertical space and lets the section sit compactly in the page.
 * The rail shows edge fades to hint at more content.
 *
 * From `sm` up: a staggered CSS multi-column wall — three columns at
 * `sm`, four from `lg`. Cards fill down one column and on to the next,
 * so the order reads top-to-bottom per column. The cap and expand
 * button control how many are shown.
 *
 * LIGHTBOX. Tapping any photograph opens it full-screen in a modal
 * overlay, with left / right navigation, keyboard support (Escape,
 * arrows) and swipe-to-navigate on touch. The product link and caption
 * are shown inside the lightbox so the visitor can still reach the
 * product page from there.
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
 * actually uploaded, it is scaled to cover its slot and the overflow is
 * cropped, so no card ever shows a band of dead colour beside a picture
 * that does not match its slot. The cost is the edges of an off-ratio
 * upload, which is why a story photo wants its subject near the middle.
 *
 * Captions stay laid over the bottom of the picture rather than stacked
 * under it. A card as tall as its own words is a card whose height the
 * pattern does not control, and one long quote would then drag a column
 * out of step with the rest.
 */
export function CustomerStories({ stories = [] }) {
  // The wall starts capped (see the two limits below) and this opens it.
  const [expanded, setExpanded] = useState(false);

  // Which story is open in the lightbox, or -1 when closed.
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  if (!stories.length) return null;

  // Whether anything is being held back — only relevant for the wall
  // (sm+), since the rail (phone) shows everything via scroll.
  const cappedWide = stories.length > WIDE_LIMIT;

  const openLightbox = (index) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(-1);

  return (
    <section
      id="customers"
      className="sb-band scroll-mt-40 bg-sb-surface/25 wide:scroll-mt-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="sb-eyebrow flex items-center justify-center gap-2 text-[10px] text-sb-gold-text">
            <Butterfly className="size-5 text-sb-maroon-deco" />
            From Our Customers
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
            Worn, and sent back to us
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
            Photographs and messages customers have shared with the shop.
          </p>
        </div>
      </div>

      <div className="mt-6">
        {/* ── PHONE: horizontal rail ── */}
        {/* Visible below `sm` only. A swipeable row with snap points,
            edge fades, and no cap — every story is reachable by scrolling
            sideways, so the section stays compact vertically. */}
        <div className="relative sm:hidden">
          <ul className="sb-no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {stories.map((story, index) => (
              <StoryCard
                key={story.image}
                story={story}
                index={index}
                hiddenClass=""
                rail
                onImageClick={() => openLightbox(index)}
              />
            ))}
          </ul>

          {/* Soft edge fades to hint there is more to scroll */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-sb-surface/25 to-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-sb-surface/25 to-transparent"
          />
        </div>

        {/* ── DESKTOP: staggered multi-column wall ── */}
        {/* Hidden below `sm`. The column count steps with the width, and
            the cap steps with it at the same breakpoint (see WIDE_LIMIT). */}
        <ul className="mx-auto hidden max-w-7xl gap-5 sm:columns-3 sm:block sm:px-6 lg:columns-4 lg:px-8">
          {stories.map((story, index) => (
            <StoryCard
              key={story.image}
              story={story}
              index={index}
              hiddenClass={expanded ? "" : hiddenAboveWide(index)}
              onImageClick={() => openLightbox(index)}
            />
          ))}
        </ul>

        {/* Show-all / show-fewer button — desktop wall only */}
        {cappedWide ? (
          <div className="hidden pt-8 text-center sm:block">
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

      {/* ── LIGHTBOX ── */}
      {lightboxIndex >= 0 ? (
        <Lightbox
          stories={stories}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      ) : null}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Lightbox — full-screen image viewer with navigation
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Full-screen overlay that shows one story photograph at a time.
 *
 * Supports:
 * - Left / right arrows to navigate between stories
 * - Keyboard: Escape to close, ← / → to navigate
 * - Touch: swipe left / right to navigate
 * - Clicking the backdrop (outside the image) closes the lightbox
 * - The caption (name, quote, product link) is shown at the bottom
 */
function Lightbox({ stories, index, onChange, onClose }) {
  const story = stories[index];
  const count = stories.length;
  const hasPrev = index > 0;
  const hasNext = index < count - 1;

  const backdropRef = useRef(null);
  const touchStart = useRef(null);

  const prev = useCallback(() => {
    if (hasPrev) onChange(index - 1);
  }, [hasPrev, index, onChange]);

  const next = useCallback(() => {
    if (hasNext) onChange(index + 1);
  }, [hasNext, index, onChange]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  // Lock body scroll while the lightbox is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Touch swipe handling
  const onTouchStart = (e) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) > 50) {
      if (dx > 0) prev();
      else next();
    }
  };

  // Close when clicking the dark backdrop, not the image or controls
  const onBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  const { image, body, customer_name: name, product } = story;

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-label="Full-size photograph"
      onClick={onBackdropClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/10 backdrop-blur-2xl"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-50 flex size-10 cursor-pointer items-center justify-center rounded-full border border-sb-gold/30 bg-sb-surface/60 text-sb-heading transition-colors hover:bg-sb-surface"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="4" x2="16" y2="16" />
          <line x1="16" y1="4" x2="4" y2="16" />
        </svg>
      </button>

      {/* Previous arrow */}
      {hasPrev ? (
        <button
          type="button"
          onClick={prev}
          aria-label="Previous photograph"
          className="absolute left-2 top-1/2 z-50 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-sb-gold/30 bg-sb-surface/60 text-sb-heading transition-colors hover:bg-sb-surface sm:left-4 sm:size-12"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : null}

      {/* Next arrow */}
      {hasNext ? (
        <button
          type="button"
          onClick={next}
          aria-label="Next photograph"
          className="absolute right-2 top-1/2 z-50 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-sb-gold/30 bg-sb-surface/60 text-sb-heading transition-colors hover:bg-sb-surface sm:right-4 sm:size-12"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      ) : null}

      {/* The image and caption */}
      <div className="relative mx-14 flex max-h-[85vh] max-w-3xl flex-col items-center sm:mx-20">
        <div className="relative max-h-[75vh] w-auto overflow-hidden rounded-2xl border border-sb-gold/30 shadow-xl shadow-sb-maroon-deco/10">
          <Image
            src={image}
            alt={altFor(name, product)}
            width={800}
            height={1200}
            sizes="(min-width: 768px) 700px, 85vw"
            className="max-h-[75vh] w-auto rounded-2xl object-contain"
            priority
          />
        </div>

        {/* Caption below the image */}
        {(body || name || product) ? (
          <div className="mt-3 w-full max-w-lg text-center">
            {body ? (
              <p className="text-sm leading-relaxed text-sb-text">
                &ldquo;{body}&rdquo;
              </p>
            ) : null}

            {name ? (
              <p className={`text-sm font-semibold text-sb-heading ${body ? "mt-2" : ""}`}>
                {name}
              </p>
            ) : null}

            {product ? (
              <p className={`text-xs text-sb-text-muted ${body || name ? "mt-2" : ""}`}>
                on{" "}
                <Link
                  href={productPath(product)}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-sb-heading underline underline-offset-2 hover:text-sb-maroon-deco"
                >
                  {product.name}
                </Link>
              </p>
            ) : null}

            {/* Counter */}
            <p className="mt-2 text-xs text-sb-text-muted/60">
              {index + 1} / {count}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-sb-text-muted/60">
            {index + 1} / {count}
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Constants and helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * How many cards the wall shows before the button on wide screens.
 *
 * Nine from `sm` up: three full rows at three columns and a little over
 * two at four. Enough that the stagger reads as a wall rather than as a
 * row that came out uneven, and few enough that the section is still one
 * part of the page rather than the end of it. The API serves up to two
 * dozen, and two dozen photographs unrolled by default is more home page
 * than this section is worth.
 *
 * There is no small-screen limit any more: the phone shows a horizontal
 * rail that scrolls sideways, so every story is reachable without the
 * section eating vertical space.
 */
const WIDE_LIMIT = 9;

/**
 * Which cards are hidden while the wall is capped (wide screens only).
 *
 * On the phone rail all cards are shown, so there is no small cap.
 */
function hiddenAboveWide(index) {
  if (index < WIDE_LIMIT) return "";

  // Past the cap: hidden until the button is pressed.
  return "hidden";
}

/**
 * The heights the wall cycles through.
 *
 * Five of them, against three columns at `sm` and four at `lg`. That is
 * on purpose: a pattern as long as the column count would hand every
 * column the same run of shapes and the wall would come out in neat rows,
 * which is the thing it exists to avoid. Five divides evenly into none
 * of the three, so the shapes keep falling in a different place down
 * each column at every width.
 *
 * In the phone rail every card uses a uniform 3:4 portrait ratio so the
 * row has an even top edge and is comfortable to swipe through.
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

/** Uniform ratio for the phone rail so the row has an even top edge. */
const RAIL_RATIO = "aspect-3/4";

/**
 * One card.
 *
 * The image area is clickable and opens the lightbox. When the story
 * names a product, the product link is shown in the caption overlay —
 * it no longer wraps the whole card, so that tapping the image always
 * opens the lightbox rather than navigating away.
 */
function StoryCard({ story, index, hiddenClass, rail, onImageClick }) {
  const { image, body, customer_name: name, product } = story;

  // Whether there is anything to print under the picture at all. Most
  // stories are a photograph and nothing else, so this is false more
  // often than not.
  const caption = Boolean(body || name || product);

  const card = (
    <article
      role="button"
      tabIndex={0}
      onClick={onImageClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onImageClick();
        }
      }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-sb-gold/35 transition-shadow hover:shadow-lg hover:shadow-sb-maroon-deco/10"
    >
      <MediaFrame
        src={image}
        alt={altFor(name, product)}
        ratio={rail ? RAIL_RATIO : RATIOS[index % RATIOS.length]}
        sizes={
          rail
            ? "60vw"
            : "(min-width: 1024px) 300px, (min-width: 768px) 240px, (min-width: 640px) 190px, 46vw"
        }
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
              <Link
                href={productPath(product)}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-white underline underline-offset-2 hover:text-white/90"
              >
                {product.name}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );

  // Rail cards are fixed-width flex children; wall cards break columns.
  const liClass = rail
    ? `shrink-0 snap-start w-[60vw] max-w-[240px] ${hiddenClass}`
    : `mb-5 break-inside-avoid ${hiddenClass}`;

  return (
    <li className={liClass}>
      {card}
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
