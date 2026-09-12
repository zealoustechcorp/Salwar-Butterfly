"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { CarouselDots, CarouselEdge, useCarousel } from "./Carousel";
import { GarmentArt } from "./GarmentArt";
import { MediaFrame } from "./MediaFrame";
import { Butterfly } from "./Ornaments";
import { Stars } from "./Stars";
import { useBrowse } from "./BrowseProvider";

const ROTATE_MS = 5000;

/**
 * Opening statement. The imagery is the shop's own homepage banner set — no
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
 * case, the slide is what it always was: artwork with `alt=""`, because the
 * headline beside it is the text.
 *
 * The fold is stacked rather than split: the copy sits centred above a carousel
 * that runs edge to edge. It was two columns, which capped the banner at a
 * little under half a wide screen — the shop's banners are its own artwork and
 * a flyer shown 560px wide is a thumbnail of itself. Full-bleed also means the
 * frame can be wide rather than 16:9, so the band is a letterbox at desktop
 * widths instead of a 1000px-tall wall that buries everything under it.
 *
 * The rating line under the buttons (F-06.08) holds to the same rule as the
 * imagery above it: it is the shop's real score across its real reviews, and it
 * is absent entirely until there are some. No "★★★★★ 5.0 (0)", no rounded-up
 * placeholder — an invented rating in the first fold is the most conspicuous
 * possible place to put a claim the shop cannot support.
 */
export function Hero({ banners = [], topDiscount, rating }) {
  const { focusShop, setTab } = useBrowse();
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

  const openShop = (tab) => {
    setTab(tab);
    focusShop();
  };

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Both of these used to bloom at the top right, behind the banner
          column. The banner is now an opaque band across that whole corner,
          so they were decorating something nobody could see — they are
          anchored to the bottom instead, where the copy is. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(120%_95%_at_78%_100%,#ebcbc0_0%,#fdf7f1_62%)]"
      />
      <div
        aria-hidden="true"
        className="absolute -right-20 -bottom-28 size-[20rem] rounded-full border border-sb-gold/35 lg:size-[30rem]"
      />

      {/* The shop's own banner set as a carousel — with the illustrated
          lockup standing in when there is nothing to show, whether that is
          because the shop has published no banners or because none of the
          photographs would load.

          First on the page and the width of the window. It is the one thing
          here that is not held inside a container, and it is above the
          headline rather than beside it because the banners are what the
          shop actually wants seen first — a festival drop or a sale is on
          them, and the brand line under them keeps just as well.

          The fallback is *not* full width: three drawn figures stretched
          across a wide screen stop reading as a lockup and start reading as
          a gap. */}
      {allDown ? (
        <div className="relative mx-auto w-full max-w-md px-4 pt-6 sm:px-6 lg:px-8">
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

      {/* The copy, as a band under the banner rather than a second hero.
          Centring it was wrong once the picture moved above it: a display
          headline set in the middle of the page reads as the top of a fold,
          and there was already a fold above this one — two openings stacked,
          each undercutting the other. Split left and right it stops competing
          and starts doing the job it actually has down here, which is to say
          what the shop is and give somewhere to go next.

          `items-end` rather than `items-center`: the headline and the buttons
          are the two things a reader lands on, and sitting them on a shared
          baseline is what makes the two columns read as one band instead of
          two blocks that happen to be side by side. */}
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-end md:gap-12">
          <div>
            <p className="sb-eyebrow flex items-center gap-2 text-[9px] text-sb-gold-text sm:text-[10px]">
              <Butterfly className="size-4 text-sb-maroon-deco sm:size-5" />
              Limited runs · new drops daily
            </p>

            {/* The shop's own tagline is the headline — it is the brand line,
                not a strapline to bury above one. Two lines and a good deal
                smaller than it was: at 8xl it was the loudest thing on a page
                whose loudest thing is now a photograph the width of the
                window, and the two were shouting over each other. */}
            <h1 className="mt-3 font-display text-4xl leading-[1.06] font-semibold text-sb-heading sm:text-5xl lg:text-[3.5rem]">
              Fashion
              <br />
              meets <em className="italic">comfort.</em>
            </h1>
          </div>

          <div>
            <p className="max-w-xl text-sm leading-relaxed text-sb-text sm:text-base">
              Salwar suits, co-ord sets and anarkalis in dhabu cotton, azrak block print and
              Chanderi silk — cut for everyday ease, finished in limited runs and shipped free
              across India.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => openShop("new")}
                className="inline-flex items-center gap-2 rounded-full bg-sb-btn-primary px-5 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose sm:px-7 sm:py-3.5"
              >
                Shop new arrivals
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
              {topDiscount > 0 ? (
                <button
                  type="button"
                  onClick={() => openShop("offers")}
                  className="inline-flex items-center gap-2 rounded-full border border-sb-heading px-5 py-3 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60 sm:px-7 sm:py-3.5"
                >
                  Up to {topDiscount}% off
                </button>
              ) : null}

              {/* Beside the buttons rather than on a line of its own. Loose
                  under them it was a fourth stacked row and read as an
                  afterthought; on the same row it is what it is — the reason
                  to press the button next to it. The pill is there to stop it
                  being mistaken for a third button: same row, plainly not the
                  same kind of thing.

                  Absent entirely until the shop has reviews — see the note on
                  <Hero> above. */}
              {rating?.count ? (
                <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-sb-gold/45 bg-sb-bg/70 px-3.5 py-2 text-sm text-sb-text">
                  <Stars rating={rating.average} />
                  <span className="font-semibold text-sb-heading tabular">
                    {rating.average.toFixed(1)}
                  </span>
                  <span className="text-sb-text-muted">
                    from {rating.count} customer{rating.count === 1 ? "" : "s"}
                    {/* Named only when it means something. "across 1 piece"
                        beside a shop of 200 reads worse than saying nothing. */}
                    {rating.products > 1 ? ` across ${rating.products} pieces` : ""}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
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
