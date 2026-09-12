"use client";

import Link from "next/link";

import { money } from "@/lib/format";
import { Badge, cx } from "./ui";

/** Base price struck through when an offer is live, plus the percentage badge. */
export function PriceCell({ basePrice, salePrice, discountPercent, align = "right" }) {
  const discounted = discountPercent > 0;
  return (
    <div className={cx("tabular leading-tight", align === "right" ? "text-right" : "text-left")}>
      <div
        className="flex items-center gap-1.5"
        style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}
      >
        <span className="text-sm font-semibold text-ink-900">{money(salePrice)}</span>
        {discounted ? (
          <Badge tone="brand" className="px-1.5">
            −{Number(discountPercent)}%
          </Badge>
        ) : null}
      </div>
      {discounted ? (
        <div className="text-xs text-ink-400 line-through">{money(basePrice)}</div>
      ) : (
        <div className="text-xs text-ink-400">list price</div>
      )}
    </div>
  );
}

export function ActiveDot({ active }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden="true"
        className={cx("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-ink-300")}
      />
      <span className={active ? "text-ink-700" : "text-ink-400"}>{active ? "Active" : "Inactive"}</span>
    </span>
  );
}

// --- Stat tiles -------------------------------------------------------------

const STAT_VALUE_TONES = {
  neutral: "text-ink-900",
  brand: "text-brand-700",
  amber: "text-amber-700",
  red: "text-red-700",
  green: "text-emerald-700",
};

/** `lg` is for the row that leads a screen — takings, not counts. */
const STAT_VALUE_SIZES = {
  md: "text-[22px] @2xs:text-2xl",
  lg: "text-2xl @2xs:text-[28px]",
};

/**
 * One figure, in the shape every admin screen counts in.
 *
 * Two layouts, chosen by the tile's own width rather than the window's — the
 * rail takes 16rem on desktop and none on mobile, so the same viewport width
 * leaves the tile two very different amounts of room and a `sm:` here would
 * be guessing. Under 18rem it stacks: label, figure, context. Over it the
 * figure moves to the right and the context tucks under the label, which is
 * what keeps a tile stranded four-to-a-row on a wide screen from being mostly
 * white space.
 *
 * Rows rather than a flex column, with the label track taking the slack, so
 * the figures in a row stay on one line even when a long label wraps and its
 * neighbours' do not.
 *
 * `href` makes the whole tile the link to the screen that can act on the
 * number. Without one it stays inert — a tile that looks clickable and is not
 * is worse than one that never suggested it.
 */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  size = "md",
  href,
  className,
  children,
}) {
  const body = (
    // Wide tiles drop back to two auto rows and centre the pair, so the
    // figure ends up beside the label rather than under it.
    <div
      className={cx(
        "grid flex-1 grid-rows-[1fr_auto_auto] gap-x-4",
        "@2xs:grid-cols-[minmax(0,1fr)_auto] @2xs:grid-rows-[auto_auto] @2xs:content-center",
      )}
    >
      <p className="min-w-0 text-[11px] leading-4 font-medium tracking-wide text-ink-500 uppercase @2xs:col-start-1 @2xs:row-start-1">
        {label}
      </p>

      {children ? (
        <div className="mt-1.5 min-w-0 @2xs:col-span-2 @2xs:row-start-2">{children}</div>
      ) : (
        <>
          <p
            className={cx(
              // break-words, not truncate: a value here can be a date as
              // easily as a count, and wrapping one onto a second line beats
              // silently clipping digits off the end of it.
              "tabular min-w-0 pt-2 leading-tight font-semibold break-words",
              STAT_VALUE_SIZES[size] ?? STAT_VALUE_SIZES.md,
              "@2xs:col-start-2 @2xs:row-span-2 @2xs:row-start-1 @2xs:self-center @2xs:pt-0 @2xs:text-right",
              STAT_VALUE_TONES[tone] ?? STAT_VALUE_TONES.neutral,
            )}
          >
            {value}
          </p>
          {sub ? (
            <p className="mt-1.5 line-clamp-2 min-w-0 text-xs leading-4 text-ink-500 @2xs:col-start-1 @2xs:row-start-2 @2xs:mt-1">
              {sub}
            </p>
          ) : null}
        </>
      )}
    </div>
  );

  const shell =
    "@container flex h-full flex-col rounded-xl bg-white px-3.5 py-3 ring-1 ring-ink-200/80";

  if (!href) return <div className={cx(shell, className)}>{body}</div>;

  return (
    <Link
      href={href}
      className={cx(
        shell,
        "transition-shadow hover:shadow-sm hover:ring-ink-300",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        className,
      )}
    >
      {body}
    </Link>
  );
}

/**
 * The row a set of <StatTile>s sits in.
 *
 * Column counts step on the row's own width, not the window's, for the same
 * reason the tile does: every admin screen sits inside a 16rem rail on
 * desktop and none of it on mobile, so the same viewport width means two very
 * different amounts of room. Steps skip the counts that would strand a single
 * tile on a line of its own — a four-tile row never passes through three.
 */
const STAT_GRID_COLUMNS = {
  3: "grid-cols-2 @lg:grid-cols-3",
  4: "grid-cols-2 @2xl:grid-cols-4",
  5: "grid-cols-2 @md:grid-cols-3 @4xl:grid-cols-5",
};

export function StatGrid({ cols = 4, className, children }) {
  return (
    <div className={cx("@container", className)}>
      <div
        className={cx(
          "grid gap-3",
          STAT_GRID_COLUMNS[cols] ?? STAT_GRID_COLUMNS[4],
        )}
      >
        {children}
      </div>
    </div>
  );
}
