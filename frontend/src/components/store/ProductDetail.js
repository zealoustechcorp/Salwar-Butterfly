"use client";

import { Check, Heart, Minus, Plus, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { money, shortDate } from "@/lib/format";
import { availabilityNotice } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { WhatsAppGlyph } from "./Ornaments";
import { Photo } from "./Photo";
import { SizeChartButton } from "./SizeChart";
import { Stars } from "./Stars";
import { useStore } from "./StoreProvider";

/**
 * A single piece, in full (F-06 Product Browsing).
 *
 * Everything on this screen comes from the committed snapshot of the live shop
 * — the same row the card on the home page was rendered from. What the detail
 * view adds is the part a 2-up grid tile has no room for:
 *
 *   - the shop's second photograph, where it uploaded one;
 *   - **per-size stock**, which is the honest reason to open this page at all.
 *     The card can only say "6 sizes"; here a shopper sees that 38 is gone and
 *     only one 40 is left before they pick, not after.
 *   - a quantity that cannot exceed what the chosen size actually holds.
 *
 * There is no description, care label or colourway, because the shop publishes
 * none of those — a detail page padded with invented copy about a real garment
 * would be worse than a short one.
 *
 * Reviews (F-06.08) are the one thing that rule used to exclude and no longer
 * does, now that the shop has an admin page to publish them from. They live in
 * <ProductReviews> at the bottom of the route; what appears here is the score,
 * and only on a piece that genuinely has one.
 */
export function ProductDetail({ product, shop }) {
  const { addToBag, toggleWish, wishlist } = useStore();
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);

  const shots = [product.image, product.image2].filter(Boolean);
  const wished = wishlist.includes(product.id);

  const chosen = product.sizes.find((row) => row.size === size) ?? null;
  // Nothing can be added without a size, so the ceiling is the chosen size's
  // own shelf — never the product total, which is spread across six sizes.
  const ceiling = Math.max(1, Math.min(chosen?.stock ?? 1, 99));
  const canAdd = product.in_stock && Boolean(chosen?.stock);

  /** Picking a size re-clamps a quantity the previous size allowed. */
  const chooseSize = (value) => {
    const row = product.sizes.find((entry) => entry.size === value);
    if (!row?.stock) return;
    setSize(value);
    setQty((current) => Math.min(current, Math.max(1, Math.min(row.stock, 99))));
  };

  const notice = product.in_stock ? availabilityNotice(product.stock) : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:py-10">
      <Gallery product={product} shots={shots} />

      <div className="lg:py-2">
        <Link
          href={`/shop?category=${product.category_id}`}
          className="sb-eyebrow text-[10px] text-sb-gold-text underline-offset-4 hover:underline"
        >
          {product.category_name}
        </Link>

        <h1 className="mt-2 font-display text-3xl leading-tight font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          {product.name}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sb-text-muted">
          {product.fabric ? <span>{product.fabric}</span> : null}
          <span className="tabular">{product.piece_code}</span>

          {/* F-06.08. A jump link rather than a repeat of the section:
              the stars here are a signal, and the reviews themselves are
              a scroll away at the bottom of the page. Absent entirely on
              a piece nobody has reviewed — see <ProductCard>. */}
          {product.rating?.count ? (
            <a
              href="#reviews"
              className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-sb-link hover:underline"
            >
              <Stars rating={product.rating.average} size="size-3.5" />
              <span className="tabular">
                {product.rating.average.toFixed(1)} ({product.rating.count})
              </span>
            </a>
          ) : null}
        </div>

        <div className="sb-rule mt-5 h-px w-full" aria-hidden="true" />

        {/* Price */}
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-4xl font-semibold text-sb-text tabular">
            {money(product.price)}
          </span>
          {product.mrp ? (
            <>
              <span className="text-lg text-sb-text-muted line-through tabular">
                {money(product.mrp)}
              </span>
              <span className="rounded-full bg-sb-btn-rose px-2.5 py-1 text-[11px] font-bold text-sb-bg">
                {product.off}% off
              </span>
            </>
          ) : null}
        </div>
        {product.saving > 0 ? (
          <p className="mt-1 text-sm font-semibold text-sb-link tabular">
            You save {money(product.saving)}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-sb-text-muted">Inclusive of all taxes.</p>

        {/* Availability, for the whole piece */}
        {!product.in_stock ? (
          <p className="mt-5 rounded-xl bg-sb-footer/90 px-4 py-2.5 text-sm font-semibold text-sb-bg">
            Sold out — this run has ended.
          </p>
        ) : notice?.urgent ? (
          <p className="mt-5 inline-flex rounded-xl bg-sb-surface-pink px-4 py-2.5 text-sm font-semibold text-sb-ink-on-pink">
            {notice.text} across all sizes — order fast!
          </p>
        ) : null}

        {/* Per-size stock: the reason this page exists */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-bold text-sb-text">Select a size</p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xs text-sb-text-muted">
                {product.available_sizes.length} of {product.sizes.length} sizes in stock
              </p>
              {/* Next to the picker, because this is where the question is
                  actually asked — and a size a shopper chose themselves is
                  not a return reason. */}
              <SizeChartButton categoryName={product.category_name} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {product.sizes.map((row) => {
              const sold = row.stock <= 0;
              return (
                <button
                  key={row.size}
                  type="button"
                  disabled={sold}
                  onClick={() => chooseSize(row.size)}
                  aria-pressed={size === row.size}
                  aria-label={
                    sold
                      ? `Size ${row.size} — sold out`
                      : `Size ${row.size} — ${row.stock} in stock`
                  }
                  className={cn(
                    "min-w-12 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors",
                    sold
                      ? "cursor-not-allowed border-sb-gold/25 bg-sb-surface/20 text-sb-text-muted/50 line-through"
                      : size === row.size
                        ? "border-sb-heading bg-sb-heading text-sb-bg"
                        : "border-sb-gold/45 bg-sb-bg text-sb-text hover:border-sb-heading",
                  )}
                >
                  {row.size}
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 min-h-5 text-xs text-sb-text-muted" aria-live="polite">
            {chosen ? (
              chosen.stock === 1 ? (
                <span className="font-semibold text-sb-link">
                  Last one left in size {chosen.size}.
                </span>
              ) : (
                `${chosen.stock} left in size ${chosen.size}.`
              )
            ) : product.in_stock ? (
              "Pick a size to see how many are left."
            ) : (
              "Every size in this run is gone."
            )}
          </p>

          <p className="mt-1 text-xs text-sb-text-muted">
            On the borderline between two sizes, order the larger one.
          </p>
        </div>

        {/* Quantity — capped at what the chosen size holds */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-full border border-sb-gold/45 bg-sb-bg p-1">
            <StepButton
              label="Reduce quantity"
              disabled={!canAdd || qty <= 1}
              onClick={() => setQty((current) => Math.max(1, current - 1))}
            >
              <Minus className="size-4" aria-hidden="true" />
            </StepButton>
            <span
              aria-live="polite"
              aria-label={`Quantity ${qty}`}
              className="min-w-8 text-center text-sm font-bold text-sb-text tabular"
            >
              {qty}
            </span>
            <StepButton
              label="Increase quantity"
              disabled={!canAdd || qty >= ceiling}
              onClick={() => setQty((current) => Math.min(ceiling, current + 1))}
            >
              <Plus className="size-4" aria-hidden="true" />
            </StepButton>
          </div>

          {canAdd && qty >= ceiling ? (
            <p className="text-xs text-sb-text-muted">
              That is every size {chosen.size} on the shelf.
            </p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => addToBag(product, { size, qty })}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3.5 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
          >
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
            {!product.in_stock ? "Sold out" : canAdd ? "Add to bag" : "Select a size"}
          </button>

          <button
            type="button"
            onClick={() => toggleWish(product)}
            aria-pressed={wished}
            className="flex items-center justify-center gap-2 rounded-full border border-sb-heading px-6 py-3.5 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
          >
            <Heart
              className={cn("size-4 shrink-0", wished && "fill-sb-btn-rose text-sb-btn-rose")}
              aria-hidden="true"
            />
            {wished ? "Saved" : "Save for later"}
          </button>
        </div>

        {shop?.whatsapp ? (
          <a
            href={shop.whatsapp}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
          >
            <WhatsAppGlyph className="size-4 shrink-0" />
            {product.in_stock
              ? "Ask about this piece on WhatsApp"
              : "Ask the shop if this run returns"}
          </a>
        ) : null}

        {/* What ordering it involves — the shop's own terms */}
        <ul className="mt-6 space-y-2 rounded-2xl border border-sb-gold/35 bg-sb-surface/25 p-4 text-[13px] text-sb-text sm:p-5">
          {[
            "Free shipping all over India, delivered in 5–10 working days.",
            "Online payment only — GPay, PhonePe, Paytm. No cash on delivery.",
            "Returned if it arrives damaged, defective, or as the wrong piece or size.",
          ].map((line) => (
            <li key={line} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>

        <Spec product={product} />
      </div>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-2 text-sb-text transition-colors hover:bg-sb-surface/60 disabled:cursor-not-allowed disabled:text-sb-text-muted/40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * The shop's photography, large.
 *
 * Only the shots actually uploaded are offered — 122 of the 197 pieces have a
 * second one, and a thumbnail strip of one image is just noise, so it appears
 * only when there is something to switch to.
 */
function Gallery({ product, shots }) {
  const [active, setActive] = useState(0);
  const current = shots[active] ?? null;

  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <div className="relative aspect-3/4 w-full overflow-hidden rounded-2xl border border-sb-gold/30 bg-sb-surface/40">
        <Photo
          key={current ?? "art"}
          src={current}
          alt={product.name}
          categoryName={product.category_name}
          seed={product.id}
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />

        {product.off > 0 ? (
          <span className="absolute top-3 left-3 rounded-full bg-sb-btn-rose px-3 py-1 text-[11px] font-bold text-sb-bg">
            {product.off}% off
          </span>
        ) : null}

        {!product.in_stock ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-sb-footer/90 px-3 py-1 text-[11px] font-semibold text-sb-bg">
            Sold out
          </span>
        ) : null}
      </div>

      {shots.length > 1 ? (
        <div className="mt-3 flex gap-3">
          {shots.map((shot, index) => (
            <button
              key={shot}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={active === index}
              aria-label={`Photo ${index + 1} of ${shots.length}`}
              className={cn(
                "relative aspect-3/4 w-20 overflow-hidden rounded-xl border-2 bg-sb-surface/40 transition-colors sm:w-24",
                active === index ? "border-sb-heading" : "border-sb-gold/30 hover:border-sb-gold",
              )}
            >
              <Photo
                src={shot}
                alt=""
                categoryName={product.category_name}
                seed={product.id}
                sizes="96px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Everything the snapshot records about the piece, as a plain list. */
function Spec({ product }) {
  const rows = [
    { term: "Collection", value: product.category_name },
    product.fabric ? { term: "Fabric", value: product.fabric } : null,
    {
      term: "Sizes in stock",
      value: product.available_sizes.length ? product.available_sizes.join(", ") : "None left",
    },
    { term: "Pieces on the shelf", value: `${product.stock}`, tabular: true },
    { term: "Piece code", value: product.piece_code, tabular: true },
    { term: "Added to the shop", value: shortDate(product.created_at) },
  ].filter(Boolean);

  return (
    <div className="mt-8">
      <h2 className="font-display text-2xl font-semibold text-sb-heading">Piece details</h2>
      <dl className="mt-3 divide-y divide-sb-gold/25 border-y border-sb-gold/25 text-sm">
        {rows.map(({ term, value, tabular }) => (
          <div key={term} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-sb-text-muted">{term}</dt>
            <dd className={cn("text-right font-semibold text-sb-text", tabular && "tabular")}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex gap-2 text-xs leading-relaxed text-sb-text-muted">
        <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Colour and material preference is not a return reason, and an order cannot be cancelled
        once placed — the fabric is stated above, please read it before ordering.
      </p>
    </div>
  );
}
