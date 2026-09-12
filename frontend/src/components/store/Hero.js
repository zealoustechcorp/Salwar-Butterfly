"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { CarouselDots, CarouselEdge, useCarousel } from "./Carousel";
import { GarmentArt } from "./GarmentArt";
import { MediaFrame } from "./MediaFrame";

const ROTATE_MS = 5000;

/**
 * Opening statement, and now the whole of it: the shop's own banner set, the
 * width of the window, and nothing else. The imagery is the shop's own — no
 * stock photography and nothing generated.
 *
 * The banners arrive as a prop, read from the API by the page above. They used
 * to be a frozen array in lib/store/shop.js, which meant a festival banner
 * could only reach this fold through a developer; they are now a table with an
 * admin screen over it, seeded from exactly those five URLs.
 *
 * A slide is a photograph and a place in the order, and — since migration 020 —
 * optionally the piece it is a photograph *of*. Where the shop has named one,
 * the slide is a link through to it; where it has not, which is the ordinary
 * case, the slide is what it always was: artwork with `alt=""`.
 *
 * This fold used to carry a copy block as well — an eyebrow, the brand line as
 * a display headline, a paragraph on the fabrics, the two shop buttons and the
 * shop's review score. All of it is gone, and three things went with it that
 * are worth knowing about rather than discovering:
 *
 *   - **The `<h1>` was in it**, and it was the only one on the home page.
 *     There is a screen-reader-only one below in its place: a page with no
 *     level-one heading is a page assistive tech cannot summarise and search
 *     engines read as untitled, and the banner set cannot stand in for it
 *     because every slide is deliberately `alt=""`.
 *   - **The two shop buttons were the only direct entry** to the catalogue's
 *     "new" and "offers" tabs from this fold. Browsing still reaches both
 *     through <ProductShowcase> further down, and the offers band still
 *     carries the discount, so nothing is unreachable — it is just further
 *     away. That is why `topDiscount` is no longer a prop here.
 *   - **The rating (F-06.08) no longer appears on the home page at all.** It
 *     is still computed and still shown on a product, but the shop's overall
 *     score has no other place in this page, so `rating` stopped being passed
 *     down rather than moving somewhere else.
 *
 * The decorative gradient and the gold ring went too. They were anchored to
 * the copy, and with the section reduced to one opaque band edge to edge there
 * is nowhere in it they could be seen.
 */
export function Hero({ banners = [] }) {
  // Banners that failed to load. They drop out of the carousel entirely — a
  // sliding track would otherwise stop on a blank frame — and when every one is
  // down the illustrated lockup takes over. That fallback is also what a shop
  // with no banners at all gets, so an empty carousel needs no separate case.
  const [down, setDown] = useState(() => new Set());
  // Whole banners now, not just their URLs — a slide carries the piece it
  // links to as well as the picture. Still keyed and tracked by `image`,
  // which is what the failure set holds and what is unique per row.
  const slides = banners.filter(
    (banner) => banner?.image && !down.has(banner.image),
  );
  const allDown = slides.length === 0;

  const markDown = useCallback((src) => {
    setDown((current) => new Set(current).add(src));
  }, []);

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Carrying the document outline the removed headline used to, and
          nothing else — it is the page's title read aloud, which is why it is
          the brand and what the shop sells rather than a keyword list. Kept
          in the markup and out of the design: `sr-only` is a clip, not a
          `display: none`, so it is announced and indexed while occupying no
          space and painting nothing. */}
      <h1 className="sr-only">
        Salwar Butterfly — salwar suits, co-ord sets and anarkalis in dhabu cotton, azrak block
        print and Chanderi silk
      </h1>

      {/* The shop's own banner set as a carousel — with the illustrated
          lockup standing in when there is nothing to show, whether that is
          because the shop has published no banners or because none of the
          photographs would load.

          The width of the window and, with the copy gone, the only thing in
          this section: it is not held inside a container at all, because the
          banners are what the shop wants seen first and there is no longer a
          headline for them to share the fold with.

          The fallback is *not* full width: three drawn figures stretched
          across a wide screen stop reading as a lockup and start reading as
          a gap. It keeps padding on both sides now — with nothing below it
          any more, a lockup sitting flush against the next section reads as
          part of it. */}
      {allDown ? (
        <div className="relative mx-auto w-full max-w-md px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
            {[
              { shape: "coord", seed: 1, tall: false, label: "Coord set" },
              { shape: "anarkali", seed: 4, tall: true, label: "Anarkali salwar" },
              { shape: "straight", seed: 2, tall: false, label: "Straight cut salwar" },
            ].map((figure, index) => (
              <div
                key={figure.label}
                className={`overflow-hidden rounded-t-full rounded-b-2xl border border-sb-gold/45 shadow-lg shadow-sb-maroon-deco/10 sm:rounded-b-3xl ${
                  figure.tall ? "" : "sb-float"
                }`}
                style={figure.tall ? undefined : { animationDelay: `${index * 1.6}s` }}
              >
                <div className={figure.tall ? "aspect-4/7" : "aspect-2/3"}>
                  <GarmentArt shape={figure.shape} seed={figure.seed} label={figure.label} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <BannerCarousel slides={slides} onFail={markDown} />
      )}
    </section>
  );
}

/**
 * The banner carousel: a cross-fading stack, arrows, swipe and dots.
 *
 * It advances on its own and keeps advancing under the pointer — a band this
 * wide is where the cursor happens to be, not somewhere anyone chose to put
 * it, and pausing on hover meant the carousel stood still for most visitors.
 * It still yields to a drag and to keyboard focus, and it stops altogether
 * once it has scrolled out of view or the tab goes to the background.
 * `prefers-reduced-motion` drops both the autoplay and the dissolve, leaving
 * the arrows and dots as the way through.
 *
 * `fade` rather than a sliding track: at full width the band is most of the
 * fold, and a 1900px-wide photograph shoved sideways is a lot of motion for a
 * change nobody asked for — the dissolve lets one banner become the next
 * without the page appearing to lurch. It is still swipeable, and a swipe
 * still moves something under the finger; see FADE_DRAG_DAMP.
 *
 * The swiping, the timer and the arrow keys all live in <useCarousel>; what is
 * left here is the shape of the frame and what goes in it. `trackMouse` is on
 * because a banner has nothing on it to select or drag away, so a mouse may
 * throw it the same way a finger does.
 */
function BannerCarousel({ slides, onFail }) {
  const count = slides.length;
  const { index, go, to, swipe, hold, track, slideProps, held } = useCarousel({
    count,
    rotateMs: ROTATE_MS,
    trackMouse: true,
    fade: true,
  });

  return (
    // `relative` so the band stacks above the section's absolutely positioned
    // gradient rather than under it — the copy below gets that for free from
    // its own container, the full-bleed carousel has no container to get it
    // from.
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Shop banners"
      className="relative"
      {...hold}
    >
      {/* One fixed shape per breakpoint. The banner set is a mix of whatever
          the shop has had made — a wide flyer, a square post, a photo off
          a phone — and letting each slide bring its own shape would make
          the first fold of the home page change height as it rotates.
          What fills the frame is MediaFrame's problem; how big the frame
          is, is this line's.

          It widens as the window does, and that is the whole reason the
          ratio is not one number any more. Full-bleed 16:9 is 1080px tall
          on a 1920px screen — a banner nobody can see the bottom of and a
          page whose second section starts below the fold. The letterbox
          keeps the band roughly a third of a tall window at every size.

          No rounding and no side border: those are edges, and the point of
          a full-bleed band is that it has none. A rule along the bottom is
          all that is left, and only there — the band butts straight up
          against the sticky header, which already draws its own.

          The ground colour is not decoration. A cross-fading stack has a
          moment where neither picture is fully opaque, and a damped drag
          opens a sliver at one edge; both want something behind them that
          is not the page's gradient showing through.

          `touch-pan-y` is load-bearing rather than decorative: it is what
          tells the browser this box owns horizontal gestures and the page
          still owns vertical ones, so a swipe across the banner never eats
          a scroll down the home page. */}
      <div
        {...swipe}
        className="relative aspect-16/9 touch-pan-y overflow-hidden border-b border-sb-gold/45 bg-sb-bg shadow-lg shadow-sb-maroon-deco/15 md:aspect-[21/9] xl:aspect-[2.7/1]"
      >
        <div {...track}>
          {slides.map((slide, i) => (
            <div
              key={slide.image}
              aria-roledescription="slide"
              aria-label={`Banner ${i + 1} of ${count}`}
              {...slideProps(i)}
            >
              <Slide
                slide={slide}
                // A slide scrolled off screen is hidden from assistive
                // tech by the wrapper above, and its link must leave the
                // tab order with it — otherwise tabbing through the fold
                // walks into banners nobody can see.
                reachable={i === index}
                priority={i === 0}
                onFail={onFail}
              />
            </div>
          ))}
        </div>

        {/* Edges rather than buttons: on a band this size the banner is the
            whole point of the fold, and two discs parked permanently over it
            were the only furniture in the way. Now each outer fifth is the
            control, and nothing is drawn until that side is under the
            pointer — see <CarouselEdge> for what that costs a linked
            banner. */}
        {count > 1 ? (
          <>
            <CarouselEdge side="left" label="Previous banner" onClick={() => go(-1)} />
            <CarouselEdge side="right" label="Next banner" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {/* The dots double as the countdown here — the same `ROTATE_MS` the
          timer runs on, so the bar cannot drift from the thing it describes,
          and `held` is the same flag that stops the timer. On a full-bleed
          banner this is the only thing on the page that says the picture is
          about to change, which is why it is worth the extra prop. */}
      <CarouselDots
        count={count}
        index={index}
        onSelect={to}
        label={(i) => `Show banner ${i + 1}`}
        rotateMs={ROTATE_MS}
        held={held}
      />
    </div>
  );
}

/**
 * One banner: a photograph, and a link around it where the shop named a piece.
 *
 * The link is optional and most slides will not have one — `product` is null
 * both when the banner names nothing and when the piece it names has gone off
 * sale, because the API collapses those before they get here. Either way this
 * renders the picture and nothing else, which is what the carousel did before
 * links existed at all.
 *
 * Two things about the linked case are worth stating, because both are easy to
 * get wrong and neither is visible in a screenshot:
 *
 *   - **The picture keeps `alt=""` and the link carries the name.** A banner is
 *     decorative beside the headline, and that does not change by becoming
 *     clickable — but a link whose only content is an image with an empty alt
 *     has no accessible name at all, which is a link announced as nothing.
 *     `aria-label` on the anchor is what names the destination without putting
 *     a second description of the artwork on the page.
 *   - **A drag must not navigate.** That is not handled here: <useCarousel>
 *     catches the click a swipe leaves behind, in the capture phase, before it
 *     can reach this anchor. See CLICK_GRACE_MS.
 */
function Slide({ slide, reachable, priority, onFail }) {
  /* `ratio="h-full w-full"` because the shape is the track's to decide here,
     not the frame's — every slide is the 16:9 box around it. A banner that is
     not 16:9 is fitted inside against a blurred copy of itself rather than
     being cropped to the middle third. */
  const picture = (
    <MediaFrame
      src={slide.image}
      alt=""
      ratio="h-full w-full"
      // The slide is the window wide now, at every breakpoint — it used to
      // be a column, hence the 45vw that was here.
      sizes="100vw"
      priority={priority}
      onError={() => onFail(slide.image)}
    />
  );

  if (!slide.product) return picture;

  return (
    <Link
      href={`/product/${slide.product.id}`}
      aria-label={`Shop ${slide.product.name}`}
      tabIndex={reachable ? undefined : -1}
      draggable={false}
      // `relative` so the badge below anchors to this slide and travels with
      // it. Anchored to the carousel frame instead, it would sit still while
      // the picture it names slid out from under it.
      className="group/slide relative block h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sb-link"
    >
      {picture}

      {/* What says the picture is a door. Without it a linked banner and a
          plain one are pixel-identical, and the only way to find out which
          this is would be to tap it.

          Bottom-left, clear of the dots below, and inset with the same
          gutters as the edge controls so it lines up with the page rather
          than with the window. On a pointer it lifts on hover; on touch,
          where there is no hover to wait for, it is simply always there.

          `z-20` and `pointer-events-auto`, which together are the one hole
          punched through the left edge control. That region sits at `z-10`
          across the outer fifth of the banner and the badge overlaps it, so
          without this the label naming the product would be the one part of
          the picture that could not be clicked to reach it. Everything else
          on that fifth still belongs to the carousel. */}
      <span className="pointer-events-auto absolute bottom-3 left-3 z-20 inline-flex max-w-[min(78%,22rem)] items-center gap-1.5 rounded-full bg-sb-bg/90 px-3 py-1.5 text-[11px] font-semibold text-sb-heading shadow-md backdrop-blur-sm transition-transform duration-300 group-hover/slide:-translate-y-0.5 motion-reduce:transition-none sm:bottom-5 sm:left-6 sm:text-xs lg:bottom-6 lg:left-8 lg:px-4 lg:py-2 lg:text-sm">
        <span className="truncate">{slide.product.name}</span>
        <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
      </span>
    </Link>
  );
}
