"use client";

import { money, STOCK_LABEL } from "@/lib/format";
import { Badge, cx } from "./ui";

const STOCK_TONE = {
  in_stock: "green",
  low_stock: "amber",
  out_of_stock: "red",
  unavailable: "slate",
};

/** F-04.05 / F-04.06 thresholds surfaced in the admin, same rule the storefront uses. */
export function StockPill({ status, quantity, className }) {
  return (
    <Badge tone={STOCK_TONE[status] || "neutral"} className={className}>
      <span aria-hidden="true" className="text-[8px]">
        ●
      </span>
      {quantity != null ? `${quantity} · ` : ""}
      {STOCK_LABEL[status]}
    </Badge>
  );
}

/** Base price struck through when an offer is live, plus the percentage badge. */
export function PriceCell({ basePrice, salePrice, discountPercent, overridden, align = "right" }) {
  const discounted = discountPercent > 0;
  return (
    <div className={cx("tabular leading-tight", align === "right" ? "text-right" : "text-left")}>
      <div className="flex items-center gap-1.5" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
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
      {overridden ? <div className="text-[10px] font-medium text-gold-700">variant override</div> : null}
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

export function StatTile({ label, value, sub, tone = "neutral", requirement }) {
  const tones = {
    neutral: "text-ink-900",
    brand: "text-brand-700",
    amber: "text-amber-700",
    red: "text-red-700",
    green: "text-emerald-700",
  };
  return (
    <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-200/80">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-ink-500 uppercase">{label}</p>
        {requirement ? (
          <span className="font-mono text-[10px] text-ink-300">{requirement}</span>
        ) : null}
      </div>
      <p className={cx("tabular mt-1 text-2xl font-semibold", tones[tone])}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-500">{sub}</p> : null}
    </div>
  );
}
