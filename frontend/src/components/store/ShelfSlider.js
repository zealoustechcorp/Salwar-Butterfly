"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Children, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * One sideways row of pieces with previous / next arrows, a "1–4 of 12"
 * counter and a progress line under it (F-06 home shelves).
 *
 * Every shelf on the home page is one of these, so a shopper can look through
 * all of a shelf's pieces without leaving the page. The track is an ordinary
 * scroll container with snap points, so a swipe on a phone and a trackpad
 * scroll both work; the arrows only scroll it by most of a screen.
 *
 * The look of each shelf is its own — this draws none of it. `tone` picks
 * arrow colours that read on the shelf's background: "light" for the cream
 * and blush shelves, "dark" for the festival band, whose colours arrive as
 * the CSS variables --shelf-ink and --shelf-accent.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.head] what sits left of the arrows
 * @param {string} props.label names the arrows for screen readers
 * @param {"light"|"dark"} [props.tone]
 * @param {string} [props.trackClassName] extra classes for the scroll row
 */
export function ShelfSlider({ head, label, tone = "light", trackClassName, children }) {
  const track = useRef(null);
  const total = Children.count(children);
  const [view, setView] = useState({ first: 1, last: Math.min(total, 4), start: true, end: total <= 1, width: 100, offset: 0 });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el || !el.firstElementChild) return;

    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = el.firstElementChild.getBoundingClientRect().width + gap;
    const max = el.scrollWidth - el.clientWidth;
    const first = Math.min(total, Math.round(el.scrollLeft / step) + 1);
    const shown = Math.max(1, Math.floor((el.clientWidth + gap) / step));
    const width = Math.min(100, Math.max(8, (el.clientWidth / el.scrollWidth) * 100));

    setView({
      first,
      last: Math.min(total, first + shown - 1),
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= max - 2,
      width,
      offset: max > 0 ? (el.scrollLeft / max) * (100 - width) : 0,
    });
  }, [total]);

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const move = (direction) => {
    const el = track.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * Math.max(el.clientWidth * 0.85, 160),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const dark = tone === "dark";
  const arrow = cn(
    "grid size-9 place-items-center rounded-full border-[1.5px] transition-colors disabled:cursor-default disabled:opacity-30 sm:size-10",
    dark
      ? "border-(--shelf-accent) text-(--shelf-accent) enabled:hover:bg-(--shelf-accent) enabled:hover:text-(--shelf-bg)"
      : "border-sb-heading bg-sb-bg text-sb-heading enabled:hover:bg-sb-heading enabled:hover:text-sb-bg",
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">{head}</div>

        {/* No arrows for a shelf that fits on one screen. */}
        {view.start && view.end ? null : (
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "font-mono text-xs whitespace-nowrap tabular",
                dark ? "text-(--shelf-ink)/80" : "text-sb-text-muted",
              )}
              aria-live="polite"
            >
              {view.first}–{view.last} of {total}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => move(-1)} disabled={view.start} aria-label={`Previous pieces in ${label}`} className={arrow}>
                <ChevronLeft className="size-4.5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(1)} disabled={view.end} aria-label={`Next pieces in ${label}`} className={arrow}>
                <ChevronRight className="size-4.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={track}
        className={cn(
          "sb-no-scrollbar mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [&>*]:shrink-0 [&>*]:snap-start",
          trackClassName,
        )}
      >
        {children}
      </div>

      {view.start && view.end ? null : (
        <div
          aria-hidden="true"
          className={cn("mt-3 h-0.5 overflow-hidden rounded-full", dark ? "bg-(--shelf-ink)/20" : "bg-sb-gold/25")}
        >
          <div
            className={cn("h-full rounded-full transition-[margin,width] duration-200", dark ? "bg-(--shelf-accent)" : "bg-sb-heading")}
            style={{ width: `${view.width}%`, marginLeft: `${view.offset}%` }}
          />
        </div>
      )}
    </div>
  );
}
