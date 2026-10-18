"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** How far a press may travel and still count as a tap on a piece. */
const TAP_SLOP = 6;

/**
 * One sideways row of pieces (F-06 home shelves).
 *
 * No arrows, no "1–4 of 12" counter and no progress line — the shop asked for
 * none of them, on any shelf. The row is an ordinary scroll container with
 * snap points, so a swipe on a phone and a sideways trackpad scroll work as
 * they do anywhere; a mouse can drag it, which a plain scroller does not
 * allow. A soft fade at whichever edge has more to show is the only hint that
 * the row continues.
 *
 * `fade` is the colour the edges fade into — the shelf's own background — as
 * a CSS colour or variable.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.head] the shelf's heading
 * @param {string} props.label names the row for screen readers
 * @param {string} [props.fade]
 * @param {string} [props.trackClassName] extra classes for the scroll row
 */
export function ShelfSlider({ head, label, fade = "var(--color-sb-bg)", trackClassName, children }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft >= max - 2 });
    };

    // Mouse dragging. Touch and pens already scroll the row natively.
    let drag = null;
    let moved = false;

    const down = (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag = { x: event.clientX, from: el.scrollLeft, id: event.pointerId };
      moved = false;
    };
    const move = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!moved && Math.abs(dx) > TAP_SLOP) {
        moved = true;
        el.setPointerCapture(drag.id);
        // Snapping fights a drag; it comes back on release.
        el.style.scrollSnapType = "none";
      }
      if (moved) el.scrollLeft = drag.from - dx;
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      el.style.scrollSnapType = "";
    };
    // A press that turned into a drag is not a click on the piece under it.
    const click = (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
        moved = false;
      }
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      observer.disconnect();
    };
  }, []);

  const edge = "pointer-events-none absolute inset-y-0 z-20 w-12 transition-opacity duration-300 sm:w-20";

  return (
    <div>
      {head}

      <div className="relative mt-6">
        <div
          ref={track}
          role="region"
          aria-label={label}
          onDragStart={(event) => event.preventDefault()}
          className={cn(
            "sb-no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 select-none [@media(hover:hover)]:cursor-grab [@media(hover:hover)]:active:cursor-grabbing [&>*]:shrink-0 [&>*]:snap-start",
            trackClassName,
          )}
        >
          {children}
        </div>

        <span
          aria-hidden="true"
          className={cn(edge, "left-0", edges.start ? "opacity-0" : "opacity-100")}
          style={{ background: `linear-gradient(to right, ${fade}, transparent)` }}
        />
        <span
          aria-hidden="true"
          className={cn(edge, "right-0", edges.end ? "opacity-0" : "opacity-100")}
          style={{ background: `linear-gradient(to left, ${fade}, transparent)` }}
        />
      </div>
    </div>
  );
}
