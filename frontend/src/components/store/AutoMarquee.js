"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Pixels per second when nobody is pointing at the row, and while they are. */
const SPEED = 36;
const HOVER_SPEED = 7;

/** How long a drag holds the row still after it ends, in ms. */
const HAND_PAUSE = 1800;

/** How far a press may travel and still count as a tap on a piece. */
const TAP_SLOP = 6;

/**
 * A row of pieces that drifts sideways on its own, in a loop (F-06 home
 * shelves).
 *
 * It moves the row with a transform rather than by scrolling it. A scroll
 * position is rounded to whole pixels by some browsers, which at a slow
 * drift reads as a stutter; a transform moves by fractions of a pixel on the
 * compositor and stays smooth. The cost is that the row is not a native
 * scroller, so dragging (mouse or finger) and sideways trackpad scrolling
 * are handled here. Vertical swipes are left to the page (`touch-action:
 * pan-y`), so the row never traps someone scrolling past it.
 *
 * It only moves when the pieces do not fit: a row that fits is drawn once
 * and stands still. When it does move, the pieces are drawn a second time so
 * the loop has no seam, and that copy is hidden from screen readers and the
 * keyboard so nothing is announced or tabbed through twice.
 *
 * Hovering eases it down to a crawl rather than stopping it; a drag holds it
 * for a moment after letting go. It does not drift for anyone who asks their
 * device for reduced motion (dragging still works), nor while it is off
 * screen or the tab is hidden.
 */
export function AutoMarquee({ children, className, label }) {
  const viewport = useRef(null);
  const strip = useRef(null);
  const firstCopy = useRef(null);
  const secondCopy = useRef(null);
  const [overflows, setOverflows] = useState(false);

  // The loop's second copy is for the eye only: nothing in it can be tabbed
  // to, so a keyboard user meets each piece once.
  useEffect(() => {
    secondCopy.current
      ?.querySelectorAll("a, button, input, select, textarea, [tabindex]")
      .forEach((element) => element.setAttribute("tabindex", "-1"));
  }, [overflows, children]);

  // Whether there is anything to move. Measured on the first copy alone,
  // since the second only exists once this says yes.
  useEffect(() => {
    const view = viewport.current;
    const copy = firstCopy.current;
    if (!view || !copy) return undefined;

    const check = () => setOverflows(copy.offsetWidth > view.clientWidth + 4);
    check();

    const observer = new ResizeObserver(check);
    observer.observe(view);
    observer.observe(copy);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const view = viewport.current;
    const track = strip.current;
    const copy = firstCopy.current;
    if (!view || !track || !copy || !overflows) return undefined;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let last = performance.now();
    let offset = 0;
    let speed = still ? 0 : SPEED;
    let target = speed;
    let visible = true;
    let heldUntil = 0;
    let drag = null;
    let moved = false;

    // Keeps the offset inside one loop's length, so it never grows without
    // bound and the jump back is exactly one copy wide — invisible.
    const wrap = () => {
      const loop = copy.offsetWidth;
      if (loop <= 0) return;
      offset %= loop;
      if (offset > 0) offset -= loop;
    };

    const paint = () => {
      track.style.transform = `translate3d(${offset}px, 0, 0)`;
    };

    const tick = (now) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;

      // Ease toward the target speed, so hovering slows the row gently
      // instead of braking it.
      speed += (target - speed) * Math.min(1, dt * 3);

      if (!drag && visible && !document.hidden && now >= heldUntil) {
        offset -= speed * dt;
        wrap();
        paint();
      }

      frame = requestAnimationFrame(tick);
    };

    const slow = () => { target = still ? 0 : HOVER_SPEED; };
    const resume = () => { target = still ? 0 : SPEED; };

    const down = (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, from: offset, id: event.pointerId };
      moved = false;
    };

    const move = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;

      if (!moved && Math.abs(dx) > TAP_SLOP) {
        moved = true;
        view.setPointerCapture(drag.id);
      }

      if (moved) {
        offset = drag.from + dx;
        wrap();
        paint();
      }
    };

    const up = () => {
      if (!drag) return;
      if (moved) heldUntil = performance.now() + HAND_PAUSE;
      drag = null;
    };

    // A press that turned into a drag is not a tap on the piece under it.
    const click = (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    };

    // Sideways trackpad scrolls move the row; vertical ones pass through.
    const wheel = (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      offset -= event.deltaX;
      wrap();
      paint();
      heldUntil = performance.now() + HAND_PAUSE;
    };

    // Tabbing onto a piece brings it fully into view and slows the row.
    const focus = (event) => {
      slow();
      const card = event.target.closest("[data-marquee-item]");
      if (!card) return;
      const left = card.offsetLeft + offset;
      if (left < 0 || left + card.offsetWidth > view.clientWidth) {
        offset = -card.offsetLeft + 16;
        wrap();
        paint();
      }
    };

    const seen = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    seen.observe(view);

    view.addEventListener("pointerenter", slow);
    view.addEventListener("pointerleave", resume);
    view.addEventListener("pointerdown", down);
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);
    view.addEventListener("click", click, true);
    view.addEventListener("wheel", wheel, { passive: false });
    view.addEventListener("focusin", focus);
    view.addEventListener("focusout", resume);

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
      track.style.transform = "";
      view.removeEventListener("pointerenter", slow);
      view.removeEventListener("pointerleave", resume);
      view.removeEventListener("pointerdown", down);
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", up);
      view.removeEventListener("click", click, true);
      view.removeEventListener("wheel", wheel);
      view.removeEventListener("focusin", focus);
      view.removeEventListener("focusout", resume);
    };
  }, [overflows]);

  return (
    <div
      ref={viewport}
      role="region"
      aria-label={label}
      // pan-y: a vertical swipe scrolls the page as normal; only sideways
      // movement is the row's. Native image and link dragging is turned off
      // so a drag moves the row instead of lifting a ghost picture.
      className={cn("overflow-hidden", overflows && "cursor-grab touch-pan-y select-none active:cursor-grabbing")}
      onDragStart={(event) => event.preventDefault()}
    >
      <div ref={strip} className="flex w-max will-change-transform">
        <div ref={firstCopy} data-marquee-copy className={cn("flex", className)}>
          {children}
        </div>
        {/* Hidden from screen readers and taken out of the tab order (see the
            effect above), but not `inert`: inert would also stop it answering
            the pointer, and half the time the card under the cursor is in
            this copy. */}
        {overflows ? (
          <div ref={secondCopy} data-marquee-copy aria-hidden="true" className={cn("flex", className)}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
