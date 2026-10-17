"use client";

import { Check, Heart, Minus, Plus, Share2, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { money, shortDate } from "@/lib/format";
import { productPath } from "@/lib/store/links";
import { MAX_LINE_QTY, availabilityNotice, orderableQty } from "@/lib/stock";
import { lineKey, sizesInColour, soldByColour } from "@/lib/store/variants";
import { cn } from "@/lib/utils";
import { CarouselArrow, useCarousel } from "./Carousel";
import { WhatsAppGlyph } from "./Ornaments";
import { Photo } from "./Photo";
import { SizeChartButton } from "./SizeChart";
import { Stars } from "./Stars";
import { useStore } from "./StoreProvider";
import { useStoreToast } from "./Toast";

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
 * Colour is the admin's choice per product. A piece entered with colourways
 * gets a swatch row above the sizes, and every count below it — sizes in stock,
 * "2 left", the quantity ceiling — is then that colour's own shelf, because
 * that is the row checkout will take the piece from. A piece entered without
 * colours shows no picker at all and behaves exactly as it always has.
 *
 * There is no description or care label, because the shop publishes neither —
 * a detail page padded with invented copy about a real garment would be worse
 * than a short one.
 *
 * Reviews (F-06.08) are the one thing that rule used to exclude and no longer
 * does, now that the shop has an admin page to publish them from. They live in
 * <ProductReviews> at the bottom of the route; what appears here is the score,
 * and only on a piece that genuinely has one.
 */
export function ProductDetail({ product, shop }) {
  const { addToBag, bag, toggleWish, wishlist } = useStore();
  const byColour = soldByColour(product);
  // Opens on the first colourway that still has something on the shelf, so
  // the size row below it is never a row of struck-through chips on arrival.
  const [colour, setColour] = useState(() =>
    byColour ? (product.colours.find((c) => c.stock > 0) ?? product.colours[0]).name : null,
  );
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);

  // The whole gallery. Falls back to the two card shots for a catalogue
  // served by an API that predates `images`.
  const shots = product.images?.length
    ? product.images
    : [product.image, product.image2].filter(Boolean);
  const wished = wishlist.includes(product.id);

  // The size chips: per colour when the piece is sold by colour, otherwise
  // the per-size rows as before. Same shape either way — size and stock.
  const sizeRows = byColour ? sizesInColour(product, colour) : product.sizes;
  const inStockSizes = sizeRows.filter((row) => row.stock > 0).length;
  const colourLeft = byColour ? (product.colours.find((c) => c.name === colour)?.stock ?? 0) : null;

  /**
   * How many more of one size may still be added.
   *
   * Nothing can be added without a size, so the ceiling is the chosen size's
   * own shelf — never the product total, which is spread across six sizes —
   * capped by what one order may carry, and reduced by whatever the bag is
   * already holding of that size. The bag and this stepper draw on the same
   * pieces: offering three of a size the bag already holds two of would be an
   * offer the shop cannot keep, and the store would silently trim it anyway.
   */
  const remainingFor = (row) => {
    if (!row) return 0;

    const held = bag.find((line) => line.key === lineKey(product.id, row.size, colour))?.qty ?? 0;

    return Math.max(0, orderableQty(row.stock) - held);
  };

  const chosen = sizeRows.find((row) => row.size === size) ?? null;
  const remaining = remainingFor(chosen);
  const canAdd = product.in_stock && remaining > 0;

  // The stepper never shows a number the shop cannot fill. Derived rather than
  // written back into state, so an add that shrinks what is left re-clamps on
  // the next render instead of needing an effect to chase it.
  const wanted = Math.min(qty, Math.max(1, remaining));

  /** Picking a size re-clamps a quantity the previous size allowed. */
  const chooseSize = (value) => {
    const row = sizeRows.find((entry) => entry.size === value);
    if (!row?.stock) return;
    setSize(value);
    setQty((current) => Math.min(current, Math.max(1, remainingFor(row))));
  };

  /**
   * Switching colour keeps the size where that colour still has it — a
   * shopper comparing Maroon and Teal in a 40 should not have to pick 40
   * twice — and clears it where it does not, rather than leaving a chip
   * selected that the new colour has sold out of.
   */
  const chooseColour = (name) => {
    setColour(name);
    const row = sizesInColour(product, name).find((entry) => entry.size === size);
    if (!row?.stock) setSize(null);
  };

  /** "in Maroon, size 40" / "in size 40" for the stock line under the chips. */
  const inWhat = (row) => (colour ? `in ${colour}, size ${row.size}` : `in size ${row.size}`);

  const notice = product.in_stock ? availabilityNotice(product.stock) : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-2 md:gap-8 lg:gap-12 lg:px-8 lg:py-10">
      <Gallery product={product} shots={shots} />

      <div className="min-w-0 lg:py-2">
        <Link
          href={`/shop?category=${product.category_id}`}
          className="sb-eyebrow text-[10px] text-sb-gold-text underline-offset-4 hover:underline"
        >
          {product.category_name}
        </Link>

        <h1 className="mt-2 font-display text-3xl leading-tight font-semibold text-sb-heading sm:text-4xl md:text-3xl lg:text-5xl">
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

        {/* Colourways — only on a piece the shop sells by colour */}
        {byColour ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-bold text-sb-text">
                Colour: <span className="font-semibold text-sb-heading">{colour}</span>
              </p>
              <p className="text-xs text-sb-text-muted">
                {colourLeft > 0
                  ? `${colourLeft} ${colourLeft === 1 ? "piece" : "pieces"} left in ${colour}`
                  : `${colour} is sold out`}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {product.colours.map((swatch) => {
                const sold = swatch.stock <= 0;
                const picked = colour === swatch.name;
                return (
                  // Still selectable when sold out: a shopper may want to see
                  // which sizes that colour came in, and the size chips below
                  // will all say "sold out" for them.
                  <button
                    key={swatch.name}
                    type="button"
                    onClick={() => chooseColour(swatch.name)}
                    aria-pressed={picked}
                    aria-label={
                      sold
                        ? `${swatch.name} — sold out`
                        : `${swatch.name} — ${swatch.stock} in stock`
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-1.5 pr-3.5 pl-1.5 text-sm font-semibold transition-colors",
                      picked
                        ? "border-sb-heading bg-sb-surface/60 text-sb-heading"
                        : "border-sb-gold/45 bg-sb-bg text-sb-text hover:border-sb-heading",
                      sold && "text-sb-text-muted/60",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-sb-text/15",
                        !swatch.hex && "bg-sb-surface",
                        sold && "opacity-45",
                      )}
                      style={swatch.hex ? { backgroundColor: swatch.hex } : undefined}
                    >
                      {/* A strike across the dot, so "sold out" reads on the
                          swatch itself and not only from the label. */}
                      {sold ? (
                        <span className="absolute top-1/2 left-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-sb-text" />
                      ) : null}
                    </span>
                    <span className={cn(sold && "line-through")}>{swatch.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Per-size stock: the reason this page exists */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-bold text-sb-text">Select a size</p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xs text-sb-text-muted">
                {inStockSizes} of {sizeRows.length} sizes in stock
                {colour ? ` in ${colour}` : ""}
              </p>
              {/* Next to the picker, because this is where the question is
                  actually asked — and a size a shopper chose themselves is
                  not a return reason. The fit narrows it to this piece's
                  own chart; a piece with no fit recorded still opens on
                  all of them. */}
              <SizeChartButton categoryName={product.category_name} fit={product.fit} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {sizeRows.map((row) => {
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
                      ? `Size ${row.size}${colour ? ` in ${colour}` : ""} — sold out`
                      : `Size ${row.size}${colour ? ` in ${colour}` : ""} — ${row.stock} in stock`
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
                <span className="font-semibold text-sb-link">Last one left {inWhat(chosen)}.</span>
              ) : (
                `${chosen.stock} left ${inWhat(chosen)}.`
              )
            ) : !product.in_stock ? (
              "Every size in this run is gone."
            ) : byColour && colourLeft === 0 ? (
              `Every size in ${colour} is gone — try another colour.`
            ) : (
              "Pick a size to see how many are left."
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
              disabled={!canAdd || wanted <= 1}
              onClick={() => setQty(Math.max(1, wanted - 1))}
            >
              <Minus className="size-4" aria-hidden="true" />
            </StepButton>
            <span
              aria-live="polite"
              aria-label={`Quantity ${wanted}`}
              className="min-w-8 text-center text-sm font-bold text-sb-text tabular"
            >
              {wanted}
            </span>
            <StepButton
              label="Increase quantity"
              disabled={!canAdd || wanted >= remaining}
              onClick={() => setQty(Math.min(remaining, wanted + 1))}
            >
              <Plus className="size-4" aria-hidden="true" />
            </StepButton>
          </div>

          {/* Which ceiling was hit, in the shopper's terms. "Only 2 left" is a
              reason to hurry; "20 per order" is a shop rule, and hurrying will
              not help — telling them the wrong one is a WhatsApp message the
              shop cannot answer. */}
          {canAdd && wanted >= remaining ? (
            <p className="text-xs text-sb-text-muted">
              {chosen.stock > MAX_LINE_QTY
                ? `${MAX_LINE_QTY} of one size is the most a single order may carry.`
                : remaining < orderableQty(chosen.stock)
                  ? `That is every one ${inWhat(chosen)} the shop has, counting what is in your bag.`
                  : `That is every one ${inWhat(chosen)} on the shelf.`}
            </p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => addToBag(product, { size, colour, qty: wanted })}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3.5 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
          >
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
            {!product.in_stock
              ? "Sold out"
              : !chosen
                ? "Select a size"
                : // Disabled with a size chosen means the bag already holds
                  // everything of it the shop can sell — say which, rather
                  // than leaving a greyed-out "Add to bag" to be puzzled over.
                  remaining === 0
                  ? "All of it is in your bag"
                  : "Add to bag"}
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

          <ShareButton product={product} />
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

/**
 * Sends the piece to someone else — most often a WhatsApp chat.
 *
 * What is shared is the product's own URL. The preview the other person sees
 * (photograph, name, price, sizes in stock) is not built here: it is the
 * page's Open Graph metadata, which WhatsApp, Instagram and the rest read
 * from that URL. See `generateMetadata` in app/(storefront)/product/[slug].
 *
 * The phone's own share sheet where there is one; elsewhere — most desktop
 * browsers — the link is copied instead, and the toast says so.
 */
function ShareButton({ product }) {
  const toast = useStoreToast();

  const share = async () => {
    const url = `${window.location.origin}${productPath(product)}`;
    const price = product.mrp
      ? `${money(product.price)} (${product.off}% off)`
      : money(product.price);
    const text = `${product.name} — ${price} at Salwar Butterfly`;

    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text, url });
        return;
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", "Paste it anywhere to share this piece.");
    } catch {
      toast.error("Could not copy the link", url);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Share ${product.name}`}
      className="flex items-center justify-center gap-2 rounded-full border border-sb-gold/50 px-5 py-3.5 text-sm font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
    >
      <Share2 className="size-4 shrink-0" aria-hidden="true" />
      Share
    </button>
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
 *
 * The shots are a track rather than one swapped `<img>`, which is what lets a
 * shopper on a phone move between them by swiping the picture itself — the
 * gesture they will try first, and the one this page had no answer to. Every
 * shot is then in the DOM at once; that is the point of the track, and only
 * the first is loaded eagerly, so the rest cost nothing until they are near. The thumbnails stay for the pointer, and now say which
 * shot is showing after a swipe as well as after a click.
 *
 * No autoplay here. Two photographs of one garment are a thing to compare, and
 * a picture that moves on its own while somebody is looking at a hemline is a
 * picture that has to be chased back.
 */
function Gallery({ product, shots }) {
  const count = shots.length;
  // A mouse drag is not tracked: on this page a pointer has the thumbnails and
  // the arrows, and a drag across a photograph is usually someone trying to
  // save it.
  const { index, go, to, swipe, hold, track } = useCarousel({ count });
  const active = Math.min(index, Math.max(0, count - 1));

  return (
    <div className="min-w-0 md:sticky md:top-44 md:self-start wide:top-28" {...hold}>
      <div
        {...swipe}
        className="group relative aspect-3/4 w-full touch-pan-y overflow-hidden rounded-2xl border border-sb-gold/30 bg-sb-surface/40"
      >
        <div {...track}>
          {/* A piece with no photograph at all still needs one frame in the
              track, so the illustration underneath <Photo> has somewhere to
              render. `shots` is empty in that case, not full of nulls. */}
          {(count ? shots : [null]).map((shot, i) => (
            <div
              key={shot ?? "art"}
              className="relative h-full w-full shrink-0"
              aria-roledescription="slide"
              aria-hidden={count > 1 && i !== active}
            >
              <Photo
                src={shot}
                alt={i === 0 ? product.name : ""}
                categoryName={product.category_name}
                seed={product.id}
                priority={i === 0}
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Over the track, so they do not slide away with the photograph. */}
        {product.off > 0 ? (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-sb-btn-rose px-3 py-1 text-[11px] font-bold text-sb-bg">
            {product.off}% off
          </span>
        ) : null}

        {!product.in_stock ? (
          <span className="absolute bottom-3 left-3 z-10 rounded-full bg-sb-footer/90 px-3 py-1 text-[11px] font-semibold text-sb-bg">
            Sold out
          </span>
        ) : null}

        {count > 1 ? (
          <>
            <CarouselArrow side="left" label="Previous photo" onClick={() => go(-1)} />
            <CarouselArrow side="right" label="Next photo" onClick={() => go(1)} />
          </>
        ) : null}
      </div>

      {count > 1 ? (
        // A phone fits about four of up to twenty shots, so there the strip
        // is swiped sideways, without a scrollbar. From `md` there is room
        // to lay them all out, so the strip wraps and nothing is hidden.
        <div className="sb-no-scrollbar mt-3 flex snap-x gap-3 overflow-x-auto md:flex-wrap md:overflow-visible">
          {shots.map((shot, i) => (
            <button
              key={shot}
              type="button"
              onClick={() => to(i)}
              aria-pressed={active === i}
              aria-label={`Photo ${i + 1} of ${count}`}
              className={cn(
                "relative aspect-3/4 w-20 shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-sb-surface/40 transition-all duration-300 motion-reduce:transition-none sm:w-24",
                active === i
                  ? "border-sb-heading"
                  : "border-sb-gold/30 opacity-70 hover:border-sb-gold hover:opacity-100",
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
    product.colours?.length
      ? {
          term: "Colours",
          value: product.colours
            .map((c) => (c.stock > 0 ? `${c.name} (${c.stock})` : `${c.name} (sold out)`))
            .join(", "),
        }
      : null,
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
