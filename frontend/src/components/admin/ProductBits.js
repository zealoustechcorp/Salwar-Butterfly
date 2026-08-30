"use client";

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

export function StatTile({ label, value, sub, tone = "neutral" }) {
  const tones = {
    neutral: "text-ink-900",
    brand: "text-brand-700",
    amber: "text-amber-700",
    red: "text-red-700",
    green: "text-emerald-700",
  };
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200/80">
      <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={cx("tabular mt-1 text-2xl font-semibold", tones[tone])}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}
