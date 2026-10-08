"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwipeable } from "react-swipeable";

import { cn } from "@/lib/utils";

/**
 * Everything the shop's carousels have in common: a sliding track (or a
 * cross-fading stack), a swipe the track follows under the finger, autoplay
 * that yields to a gesture and to a tab nobody is looking at, arrows, dots
 * and arrow keys.
 *
 * It is one file because the alternative was three hand-rolled copies of the
 * same pointer arithmetic — the banner had one, the product gallery wanted
 * one, and the two had already drifted apart on what counts as a swipe.
 *
 * The swipe itself is react-swipeable: 1.7 kB gzipped, no dependencies of its
 * own, and it earns that by handling what the hand-rolled `pointerdown` /
 * `pointerup` pair here did not — a drag that leaves the element, a second
 * finger landing mid-swipe, velocity (so a short flick still counts), and the
 * `touch-action` dance that keeps a horizontal swipe from stealing the page's
 * vertical scroll. Nothing else was added: the sliding, the fades and the
 * hover states below are CSS transforms and transitions, so no animation
 * library is in the storefront bundle.
 */

// How far a finger travels before the track starts following it. Small, so the
// slide moves almost at once — that lag is the difference between dragging
// paper and pressing a hidden button.
const TRACK_PX = 12;

// ...and how far it has to end up for the slide to actually change. A shorter
// drag on a banner reads as a tap, not a swipe, so the track springs back.
const COMMIT_PX = 44;

// A quick flick is a swipe even when it is short — px per ms.
const FLICK = 0.35;

/**
 * How long after a swipe a click is treated as part of that swipe.
 *
 * A slide may be a link (banners that name a piece), and dragging one
 * ends with a `mouseup` over an anchor — which the browser then turns
 * into a click and a navigation nobody asked for. The window is short
 * because the only click it needs to catch is the one the gesture
 * itself generates, which arrives in the same tick; a timestamp rather
 * than a flag so a swipe that happens to produce no click cannot leave
 * a guard armed for the next genuine tap.
 */
const CLICK_GRACE_MS = 250;

/**
 * Vertical drags are the page scrolling, never the carousel.
 *
 * `preventScrollOnSwipe` calls `preventDefault()` on every tracked move
 * whatever its direction, so the way to keep a downward flick scrolling the
 * page is to make sure the vertical one is never tracked at all. Putting the
 * up/down threshold out of reach does that; `touch-pan-y` on the element is
 * the other half, and it is what makes the browser hand back a non-cancelable
 * move once it has committed to a scroll.
 */
const DELTA = { left: TRACK_PX, right: TRACK_PX, up: 1e9, down: 1e9 };

/** Where the track sits when slide `i` is the one on screen. */
const restAt = (i) => `translate3d(${-i * 100}%, 0, 0)`;

/**
 * How much of a drag a cross-fading carousel gives back under the finger.
 *
 * A fading carousel has no track to slide, so a swipe on one would otherwise
 * do nothing at all until the finger lifts — the gesture reads as broken right
 * up to the moment it works. The whole stack shifts by a damped fraction of
 * the drag instead: enough to say "this is a thing you can throw", not so much
 * that it promises a slide that is never going to arrive. It springs back as
 * the fade takes over.
 */
const FADE_DRAG_DAMP = 0.22;

/**
 * One carousel's state and behaviour.
 *
 * `rotateMs` of 0 means it never advances on its own, which is what a product
 * gallery wants — two photographs of one garment are a thing to compare, not a
 * thing to watch. `trackMouse` decides whether a mouse can drag the track as
 * well as a finger; the banner allows it, the grid does not, because there a
 * drag is usually someone selecting a product name.
 *
 * `fade` swaps the sliding track for a cross-fade: the slides stack instead of
 * queueing, and the change is one dissolving into the next. It is a property
 * of the carousel rather than of this hook's caller taste — a banner set is a
 * sequence of unrelated pictures and dissolving between them reads as the shop
 * changing its mind about what to show you, while a product gallery's photos
 * are of one garment and sliding is what says "there is another view to the
 * right of this one". Everything else — the timer, the thresholds, the click
 * guard — is identical either way; only what the track does with `index`
 * changes, plus the drag feedback, which has nothing to move.
 */
export function useCarousel({ count, rotateMs = 0, trackMouse = false, fade = false }) {
  const [active, setActive] = useState(0);

  /**
   * Keyboard focus inside the carousel: a reason to stop advancing that
   * outlives any one gesture. Kept apart from `dragging` so letting go of a
   * swipe does not restart the timer while a dot is still focused.
   *
   * This used to be hover *or* focus, and hover is deliberately gone. It was
   * a fair rule while the banner was a half-width column beside the headline
   * — a pointer resting on it was a choice. It stopped being one when the
   * banner became a band the width of the window: the cursor is simply
   * somewhere on a wide screen when the page loads, and somewhere is almost
   * always over the picture, so a carousel that paused on hover was a
   * carousel that never advanced at all for most visitors.
   *
   * What is lost with it is the one way a mouse-only visitor could stop the
   * motion — the arrows and dots change the slide, they do not stop it — so
   * there is no longer a pause mechanism of the kind WCAG 2.2.2 asks for on
   * content that moves for more than five seconds. Reduced motion is still
   * honoured in full (see below), which covers the visitors most likely to
   * need it, and that is the trade this carousel is making knowingly.
   */
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  /**
   * Whether a rotation could be seen at all — the band is on screen, in a tab
   * someone is looking at. Neither is engagement and neither replaces the
   * hover pause: they are about not doing work in a place nobody is looking.
   *
   * A banner cycling away behind six screens of products decodes a fresh
   * photograph every five seconds for nothing, and the one thing it does
   * achieve is that scrolling back up lands on whichever slide a timer picked
   * rather than the one the visitor left.
   */
  const [onScreen, setOnScreen] = useState(true);
  const [tabOpen, setTabOpen] = useState(true);

  const trackRef = useRef(null);
  // Whether the swipe that is ending changed the slide. Read in the same
  // gesture by the handler that puts the track back — see below.
  const carried = useRef(false);
  // When the last swipe ended, so the click it produces can be told from
  // a real tap on a slide that is a link.
  const swipedAt = useRef(0);

  // A slide can disappear under the index (a banner that failed to load drops
  // out of the set), so clamp rather than snapping back to the first.
  const index = count > 0 ? Math.min(active, count - 1) : 0;

  const go = useCallback(
    (delta) => {
      if (count < 2) return;
      setActive((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count],
  );

  /** Every reason the timer below might not be running, in one flag. */
  const held = focused || dragging || !onScreen || !tabOpen;

  useEffect(() => {
    if (!rotateMs || count < 2 || held) return undefined;
    // Reduced motion drops the autoplay along with the slide transition: a
    // carousel that jumps between frames with no movement to explain it is
    // worse than one that waits to be asked.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timer = setInterval(
      () => setActive((i) => (Math.min(i, count - 1) + 1) % count),
      rotateMs,
    );
    return () => clearInterval(timer);
  }, [count, rotateMs, held]);

  /**
   * Stop rotating once the band has scrolled away, and start again when it
   * comes back.
   *
   * A quarter visible rather than a single pixel: the threshold is what
   * decides when a banner counts as being looked at, and on a band that can
   * be most of the fold, a sliver at the bottom of the window is not it.
   *
   * Only for a carousel that rotates — a product gallery passes no
   * `rotateMs`, has no timer to stop, and should not be paying for an
   * observer it cannot use.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!rotateMs || !el || typeof IntersectionObserver === "undefined") return undefined;

    // The callback fires once on observe, which is what corrects the
    // optimistic `true` above without a setState in this effect's body.
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rotateMs]);

  /**
   * ...and once the tab is in the background.
   *
   * The listener only, with no initial read: a synchronous `document.hidden`
   * check here would either be a setState inside an effect body or a lazy
   * initialiser that disagrees with the server about what to render. A page
   * that opens in a background tab therefore starts its timer — which the
   * browser throttles to a crawl anyway — and corrects itself the moment the
   * tab is looked at.
   */
  useEffect(() => {
    const sync = () => setTabOpen(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const swipe = useSwipeable({
    onSwipeStart: () => setDragging(true),

    /**
     * The track under the finger. Written straight to the node rather than
     * through state: this fires on every touchmove, and re-rendering a row of
     * full-bleed photographs sixty times a second to move one transform is
     * the kind of weight the swipe was supposed to avoid.
     */
    onSwiping: (event) => {
      const el = trackRef.current;
      if (!el || count < 2) return;
      el.style.transition = "none";
      el.style.transform = fade
        ? `translate3d(${event.deltaX * FADE_DRAG_DAMP}px, 0, 0)`
        : `translate3d(calc(${-index * 100}% + ${event.deltaX}px), 0, 0)`;
    },

    /**
     * Note the order: the timestamp is stamped for *every* swipe, before
     * the thresholds below decide whether the slide actually changes. A
     * drag too short to advance the carousel is still a drag and still
     * must not open the link underneath it — that near-miss is exactly
     * when a stray navigation would be most surprising.
     */
    onSwiped: (event) => {
      if (count < 2 || (event.dir !== "Left" && event.dir !== "Right")) return;
      swipedAt.current = Date.now();
      // Distance or speed, either will do. Requiring distance alone makes a
      // confident flick feel broken; requiring speed alone punishes a slow,
      // deliberate drag.
      if (event.absX < COMMIT_PX && Math.abs(event.vxvy[0]) < FLICK) return;
      carried.current = true;
      go(event.dir === "Left" ? 1 : -1);
    },

    /**
     * Hand the track back to React.
     *
     * Clearing the inline `transition` restores the class on the element, so
     * whatever happens next is animated. When the swipe carried, a re-render
     * is already queued and will slide from wherever the finger let go to the
     * new slide; when it did not, nothing is re-rendering, so the track is put
     * back by hand and eases home from there.
     *
     * A fading stack always springs back to zero — carried or not, its rest
     * position is the same one, because it is the slides that move between
     * states, not the box holding them.
     */
    onTouchEndOrOnMouseUp: () => {
      setDragging(false);
      const el = trackRef.current;
      if (el) {
        el.style.transition = "";
        if (fade) el.style.transform = "";
        else if (!carried.current) el.style.transform = restAt(index);
      }
      carried.current = false;
    },

    delta: DELTA,
    preventScrollOnSwipe: true,
    trackTouch: true,
    trackMouse,
  });

  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    go(event.key === "ArrowLeft" ? -1 : 1);
  };

  return {
    index,
    go,
    to: setActive,
    trackRef,
    // Whether the timer above is currently stopped, which is the one thing a
    // progress indicator has to know: a countdown drawn over a carousel that
    // is being held would be counting down to nothing.
    //
    // Every reason is folded in, including the two nobody can see. That looks
    // like more than the indicator needs, and it is the point: the timer is
    // rebuilt from scratch whenever this flips, so a bar that kept draining
    // through a scroll away and back would arrive at zero while a brand-new
    // five seconds had just begun. Tying both to one flag is what keeps them
    // from drifting.
    held,
    // Spread on the element the finger lands on.
    swipe: {
      ...swipe,

      /**
       * The click a drag leaves behind, caught on the way down before it
       * can reach a link inside a slide.
       *
       * Capture phase and `stopPropagation` because the anchor is a
       * descendant: by the time a bubbling handler ran, Next's <Link>
       * would already have navigated. `preventDefault` covers the plain
       * `<a href>` case where no React handler is involved at all.
       *
       * Only swipes that actually began set the stamp, so a tap — which
       * is what a slide's link is there for — passes straight through.
       */
      onClickCapture: (event) => {
        if (Date.now() - swipedAt.current >= CLICK_GRACE_MS) return;
        event.preventDefault();
        event.stopPropagation();
      },

      // A slide that is a link is also something the browser would
      // rather drag than swipe — anchors and images are both natively
      // draggable, and a started drag swallows every mousemove after it.
      onDragStart: (event) => event.preventDefault(),
    },
    /**
     * Spread on the region that owns the arrows and dots too, so tabbing to a
     * dot holds the rotation — someone working through the controls by
     * keyboard is the case where a slide changing underneath them is worst,
     * because they cannot see where the thing they were about to press went.
     *
     * No mouse handlers: a pointer resting on the band is not engagement, and
     * treating it as such is what stopped this carousel from ever advancing.
     * `onFocus`/`onBlur` are React's delegated versions, which bubble from
     * descendants — that is what makes this work on the region rather than on
     * each control.
     */
    hold: {
      onKeyDown,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
    // The track's own props: the transform React owns between gestures, and
    // the transition that animates it. `motion-reduce` is what turns the
    // slide into a cut for a shopper who asked for less movement.
    //
    // A fading track is a stacking context and nothing else — it holds no
    // transform of its own between gestures, so React sets no style and the
    // drag's inline one is simply cleared when the finger lifts. The
    // transition is still declared, because that is what lets the damped drag
    // ease home instead of snapping.
    track: fade
      ? {
          ref: trackRef,
          className:
            "relative h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none",
        }
      : {
          ref: trackRef,
          className:
            "flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none",
          style: { transform: restAt(index) },
        },

    /**
     * One slide's props, because a stacked slide and a queued one differ in
     * more than a class: the stack needs each slide taken out of flow and laid
     * over the last, and the one underneath must stop catching clicks meant
     * for the picture on top of it — `opacity: 0` alone still swallows taps.
     *
     * `aria-hidden` is here rather than at the call site so the two modes
     * cannot drift on which slide is the one being announced.
     *
     * The two halves of the dissolve are deliberately not symmetrical, and
     * that asymmetry is the whole difference between a cross-fade and a
     * flicker. Two pictures each at half opacity do not add up to an opaque
     * frame: a quarter of whatever is behind them shows through at the
     * midpoint, so a naive fade blinks pale in the middle every five seconds.
     * Letting the incoming picture rise fast (`ease-out`, and the shorter of
     * the two durations) while the outgoing one holds on (`ease-in`) keeps
     * the frame covered throughout — by the time the old slide has given up
     * any real opacity, the new one is most of the way in.
     */
    slideProps: (i) => ({
      "aria-hidden": i !== index,
      className: fade
        ? cn(
            "absolute inset-0 transition-opacity motion-reduce:transition-none",
            i === index
              ? "opacity-100 duration-500 ease-out"
              : "pointer-events-none opacity-0 duration-700 ease-in",
          )
        : "h-full w-full shrink-0",
    }),
  };
}

/**
 * Faint over the artwork until the carousel is hovered or the button itself is
 * focused — visible enough to find, quiet enough not to compete with the
 * photograph. Wants a `group` on an ancestor.
 *
 * `className` is there for inset and size only, and exists because a
 * full-bleed banner and a boxed product gallery disagree about where the edge
 * is: 12px from the frame is a comfortable margin inside a rounded card and a
 * button glued to the window in a band that runs to both edges. It goes
 * through `cn`, so a caller's `left-*` replaces the default rather than
 * fighting it.
 */
export function CarouselArrow({ side, label, onClick, className }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        // `cursor-pointer` because a bare <button> inherits the browser's
        // arrow, and nothing in this project's CSS says otherwise. It matters
        // more on a carousel than elsewhere: the controls are the only thing
        // saying the picture is not just a picture.
        "absolute top-1/2 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-sb-gold/45 bg-sb-bg/80 text-sb-heading opacity-70 shadow-md backdrop-blur-sm transition hover:scale-105 hover:bg-sb-bg focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:hover:scale-100 sm:size-10",
        side === "left" ? "left-3" : "right-3",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

/** How much of a full-bleed banner each edge control claims. */
const EDGE_WIDTH = "w-1/5";

/**
 * The same job as <CarouselArrow>, done by the edge of the picture instead of
 * a button sitting on it.
 *
 * The whole left fifth is "previous" and the whole right fifth is "next" —
 * one large target each rather than a 40px disc, which is what a band the
 * width of the window can afford and what a 40px disc was always a
 * compromise against. What is drawn is a bare chevron, and it *labels* the
 * region rather than being it: the region was already the button, so the
 * ring, fill, blur and shadow around the glyph were drawing a target the
 * pointer did not have to find. The chevron fades in with a soft scrim from
 * the edge, only while that side is under the pointer.
 *
 * Two consequences worth being explicit about, because neither is visible in
 * a screenshot:
 *
 *   - **A linked banner loses its edges.** Where the shop has named a piece
 *     the whole slide is an anchor, and these sit on top of it: the middle
 *     three fifths still open the product, the outer two now change the
 *     slide. The badge is the exception and is deliberately lifted above
 *     them — see <Slide> — because it is the part of the picture that says
 *     there is a product behind it, and it would be perverse for the one
 *     thing naming the destination to be the one thing that will not go
 *     there.
 *   - **A tap counts, not just a hover.** There is no hover on a touch
 *     screen, so the disc never appears there and the regions are invisible;
 *     tapping near an edge still moves the carousel. That is the Stories
 *     gesture and it is what a thumb reaching the edge of a full-width
 *     banner is most likely to mean, but it does mean a tap at the very edge
 *     of a linked banner advances instead of opening.
 *
 * The scrim is not decoration either. Without it the region is an invisible
 * hotspot — a control nobody can find and nobody can predict the extent of —
 * and with it the edge visibly lights up under the pointer, which is what
 * says "this side of the picture does something".
 */
export function CarouselEdge({ side, label, onClick, className }) {
  const left = side === "left";
  const Icon = left ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "group/edge absolute inset-y-0 z-10 grid cursor-pointer items-center",
        EDGE_WIDTH,
        left
          ? "left-0 justify-items-start pl-3 sm:pl-6 lg:pl-8"
          : "right-0 justify-items-end pr-3 sm:pr-6 lg:pr-8",
        className,
      )}
    >
      {/* Behind the icon and out of the pointer's way: the button itself owns
          the clicks, and a child that swallowed them would leave a dead patch
          around the chevron.

          It carries more of the load now than it did behind a disc. A disc
          brought its own ground — a cream fill, a border, a blur — so the
          chevron on it was legible whatever the photograph underneath was
          doing. A bare chevron has none of that and sits directly on the
          shop's own artwork, which is a wide flyer one slide and a dark
          phone photo the next, so the darkening at the edge is what it is
          read against rather than a nicety on top. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/edge:opacity-100 motion-reduce:transition-none",
          left
            ? "bg-linear-to-r from-sb-footer/55 via-sb-footer/20 to-transparent"
            : "bg-linear-to-l from-sb-footer/55 via-sb-footer/20 to-transparent",
        )}
      />

      {/*
        The chevron alone, no chrome.

        Three things keep it readable where the disc used to do it for free:

          - **Cream, not ink.** `text-sb-bg` against the darkened edge above.
            The dark heading colour it wore inside a cream disc would vanish
            into the scrim now that the scrim is what it sits on.
          - **A drop shadow, not a plate.** `sb-icon-halo` — one soft dark
            halo, which costs a filter on two small icons and covers the case
            the scrim cannot: a very light banner, where
            cream-on-slightly-less-cream would otherwise be a guess. It is a
            class in globals.css rather than an arbitrary Tailwind value for
            a reason the file records.
          - **Bigger.** A 20px glyph was sized to a 40px button; with nothing
            around it, that reads as a stray mark rather than a control.

        `relative` because the scrim above is positioned and would otherwise
        paint over an in-flow sibling. `group-focus-visible` as well as
        `group-hover`, so the region is findable by keyboard — it is the
        button that takes focus, and without it the only feedback would be a
        focus ring around an otherwise invisible fifth of the banner.
      */}
      <Icon
        aria-hidden="true"
        className="sb-icon-halo relative size-7 text-sb-bg opacity-0 transition-opacity duration-200 group-hover/edge:opacity-100 group-focus-visible/edge:opacity-100 motion-reduce:transition-none sm:size-8 lg:size-10"
      />
    </button>
  );
}

/**
 * Where you are, how many there are, and — on a carousel that moves by itself
 * — how long the slide you are looking at has left.
 *
 * The active dot stretches rather than just changing colour, so it reads at a
 * glance on a small screen and without relying on the difference between two
 * tints of gold. On an autoplaying carousel it stretches further still and
 * becomes the track the countdown drains along: the position indicator and the
 * timer are one mark, because they are one fact.
 *
 * Holding the carousel — a finger dragging it, a dot focused by keyboard —
 * takes the countdown away rather than freezing it, and the dot shrinks back
 * to the plain mark it is on a carousel that never moves by itself. That is
 * not a shortcut around pausing an animation: holding clears the interval and
 * releasing builds a *new* one, so a held slide gets a full `rotateMs` when
 * it resumes, not the remainder of the one it was part-way through. A bar
 * frozen at two-thirds and then resumed would run out with seconds still to
 * go and sit there full, promising a change that was not coming. Removing it
 * says the true thing — nothing is counting — and the fill mounts fresh, from
 * empty, exactly when the timer it mirrors starts again.
 *
 * The button is not the mark. It is a transparent 24px box with the mark
 * centred in it, which is the difference between a control and a decoration
 * that happens to be clickable: the mark reads best at 8px and 8px is a third
 * of the smallest thing a finger can be asked to hit (WCAG 2.5.8 puts the
 * floor at 24, and a thumb on a phone would rather have 44). Drawing the mark
 * bigger to make it hittable would have meant a row of lozenges competing
 * with the photograph above them; padding costs nothing on screen and is what
 * lets someone jab in the general direction of a dot and get it.
 *
 * The row is spaced by that padding rather than by a `gap`. Two 24px boxes
 * side by side already leave 16px of air between their marks, and adding a
 * gap on top of it would have pushed the dots so far apart they stopped
 * reading as one set.
 *
 * @param {number} [props.rotateMs] the autoplay interval, mirrored by the
 *   fill. Omit it (or pass 0) on a carousel that only moves when asked, and
 *   the dots are just dots.
 * @param {boolean} [props.held] whether the carousel's timer is currently
 *   stopped, for any of the reasons <useCarousel> stops it
 */
export function CarouselDots({ count, index, onSelect, label, rotateMs = 0, held = false }) {
  if (count < 2) return null;

  return (
    // `mt-1` where the old row had `mt-3`: the button's own padding supplies
    // the other 8px, so the mark still sits 12px under the frame.
    <div className="mt-1 flex justify-center">
      {Array.from({ length: count }, (_, i) => {
        const current = i === index;
        const timed = current && rotateMs > 0 && !held;

        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={label(i)}
            aria-current={current}
            // `group/dot` so hover reaches the mark inside — the hit area is
            // transparent, so there is nothing on the button itself to tint.
            className="group/dot grid shrink-0 cursor-pointer place-items-center rounded-full p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative block h-2 overflow-hidden rounded-full transition-all duration-300 motion-reduce:transition-none",
                current ? "bg-sb-heading" : "w-2 bg-sb-gold/60 group-hover/dot:bg-sb-gold",
                // Longer when it is carrying a countdown, and the width
                // animates between the two: a bar draining across 24px is a
                // flicker, and the whole point is to be readable without
                // being looked at.
                current && (timed ? "w-12 bg-sb-gold/45" : "w-7"),
              )}
            >
              {timed ? (
                <span
                  className="sb-dot-fill absolute inset-0 rounded-full bg-sb-heading"
                  style={{ animationDuration: `${rotateMs}ms` }}
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
