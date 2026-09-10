"use client";

import { AlertCircle, Lock, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { money } from "@/lib/format";
import { MAX_LINE_QTY, orderableQty } from "@/lib/stock";
import { useAuth } from "./AuthProvider";
import { WhatsAppGlyph } from "./Ornaments";
import { Photo } from "./Photo";
import { SizeChartButton } from "./SizeChart";
import { useStore } from "./StoreProvider";

/**
 * The bag (F-07).
 *
 * This page used to end in a WhatsApp link: the lines were formatted into a
 * message and handed to wa.me, because there was no order API and a Checkout
 * button that dropped orders on the floor would have been a lie.
 *
 * There is an API now, so the button goes to `/checkout` and the order is
 * placed on the site. Nothing else on this page moved, which was the point of
 * writing it that way.
 *
 * No sign-in anywhere on this page, and that is still the point: the shop
 * would rather take the order than win the account. The only mention of one is
 * an offer at the bottom of the summary, which a guest can ignore.
 *
 * This route is a server component, so `products` is the live catalogue as of
 * at most a minute ago (see REVALIDATE_SECONDS in lib/store/catalogue.js). The
 * bag in localStorage may be a week old, so the two are reconciled on mount:
 * every stepper's ceiling on this page comes from `products`, never from what
 * the line remembered when it was added.
 */
export function BagView({ products, shop }) {
  const { bag, bagTotal, bagCount, setQty, syncStock, removeLine, clearBag } = useStore();
  const { isSignedIn, openAuth } = useAuth();
  const byId = new Map(products.map((product) => [product.id, product]));

  // Fold the live counts into the stored bag, trimming any line the shop can
  // no longer fill. Runs on mount and again after each change it causes, which
  // settles in one pass — see `syncStock`, which is a no-op when nothing moved.
  useEffect(() => {
    syncStock(products);
  }, [products, syncStock]);

  /**
   * What one line is allowed to hold, from the catalogue rendered with this
   * page rather than from the line's own memory.
   *
   * Falling back to `line.stock` matters: a piece withdrawn from the catalogue
   * is not in `products` at all, and treating that as "sold out" would tell a
   * shopper their bag had emptied itself. Unknown stays unknown, and checkout
   * gives the real answer.
   */
  const shelfFor = (line) => {
    const variant = byId.get(line.product_id)?.sizes?.find((row) => row.size === line.size);

    if (variant) return Math.max(0, Math.trunc(Number(variant.stock) || 0));

    return line.stock === undefined ? null : Math.max(0, Number(line.stock) || 0);
  };

  // A line saved before the catalogue moved into the database has no variant
  // id and nothing to order against. Counted here so the summary can say so
  // before the shopper reaches checkout and finds the button disabled.
  const unorderable = bag.filter((line) => !line.variant_id).length;

  // Sold out since it was added. `syncStock` deliberately leaves these alone
  // rather than deleting them — the shopper put the piece there, and removing
  // it for them looks like the bag losing things.
  const soldOut = bag.filter((line) => shelfFor(line) === 0);

  if (!bag.length) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-14 lg:px-8">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Your Bag</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
          Your bag is empty
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-sb-gold/50 bg-sb-surface/25 px-6 py-14 text-center">
          <ShoppingBag className="mx-auto size-8 text-sb-gold-text" aria-hidden="true" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-sb-text-muted">
            Nothing in it yet. The bag lives on this device, so anything you add here will still be
            waiting when you come back on the same browser.
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Start shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Your Bag</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        {bagCount} {bagCount === 1 ? "piece" : "pieces"} in your bag
      </h1>

      <div className="mt-7 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-10">
        <ul className="divide-y divide-sb-gold/30 border-y border-sb-gold/30">
          {bag.map((line) => {
            const product = byId.get(line.product_id);

            // A size can sell out, or run down to fewer than the bag holds,
            // between adding it and coming back here. Said on the line itself
            // rather than left for checkout to refuse.
            const shelf = shelfFor(line);
            const gone = shelf === 0;
            const ceiling = shelf === null ? MAX_LINE_QTY : orderableQty(shelf);
            const atCeiling = !gone && line.qty >= ceiling;

            return (
              <li key={line.key} className="flex gap-4 py-5">
                {/* The photo and the name go back to the piece — the bag is
                    where a shopper second-guesses a size or a fabric, and the
                    only way back used to be the shop and a search. */}
                <Link
                  href={`/product/${line.product_id}`}
                  aria-label={`View ${line.name}`}
                  className="relative aspect-3/4 w-20 shrink-0 overflow-hidden rounded-xl border border-sb-gold/30 bg-sb-surface/40 transition-opacity hover:opacity-85 sm:w-24"
                >
                  <Photo
                    src={line.image}
                    alt={line.name}
                    categoryName={product?.category_name}
                    seed={line.product_id}
                    sizes="96px"
                    className="object-cover"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {product ? (
                        <p className="sb-eyebrow text-[9px] text-sb-gold-text">
                          {product.category_name}
                        </p>
                      ) : null}
                      <h2 className="mt-0.5 font-display text-lg leading-snug font-semibold text-sb-heading sm:text-xl">
                        <Link
                          href={`/product/${line.product_id}`}
                          className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
                        >
                          {line.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-xs text-sb-text-muted">
                        {line.size ? `Size ${line.size}` : "One size"}
                        {product?.fabric ? ` · ${product.fabric}` : ""}
                      </p>
                      {gone ? (
                        <p className="mt-1 text-xs font-semibold text-sb-link">
                          {line.size ? `Size ${line.size} sold out` : "Sold out"} since you added
                          it — remove it before you check out.
                        </p>
                      ) : atCeiling && shelf !== null && shelf <= MAX_LINE_QTY ? (
                        <p className="mt-1 text-xs font-semibold text-sb-link">
                          {shelf === 1
                            ? "The last one, and it is in your bag."
                            : `Only ${shelf} left — that is all of them.`}
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Remove ${line.name} from the bag`}
                      className="shrink-0 rounded-full p-2 text-sb-text-muted transition-colors hover:bg-sb-surface/60 hover:text-sb-link"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                    <div className="flex items-center gap-1 rounded-full border border-sb-gold/45 p-1">
                      <button
                        type="button"
                        onClick={() => setQty(line.key, line.qty - 1)}
                        aria-label={`Reduce the quantity of ${line.name}`}
                        className="rounded-full p-1.5 text-sb-text transition-colors hover:bg-sb-surface/60"
                      >
                        <Minus className="size-3.5" aria-hidden="true" />
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold text-sb-text tabular">
                        {line.qty}
                      </span>
                      {/* Disabled at the shelf, not at some round number: the
                          "+" on the last piece in the shop must not offer a
                          second one it cannot sell. */}
                      <button
                        type="button"
                        disabled={gone || atCeiling}
                        onClick={() => setQty(line.key, line.qty + 1)}
                        aria-label={`Increase the quantity of ${line.name}`}
                        className="rounded-full p-1.5 text-sb-text transition-colors hover:bg-sb-surface/60 disabled:cursor-not-allowed disabled:text-sb-text-muted/40 disabled:hover:bg-transparent"
                      >
                        <Plus className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <p className="text-base font-bold text-sb-text tabular sm:text-lg">
                      {money(line.price * line.qty)}
                      {line.qty > 1 ? (
                        <span className="ml-2 text-xs font-normal text-sb-text-muted">
                          {money(line.price)} each
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="lg:sticky lg:top-44 lg:self-start wide:top-28">
          <div className="rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6">
            <p className="sb-eyebrow text-[10px] text-sb-gold-text">Order summary</p>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-sb-text-muted">Subtotal</dt>
                <dd className="font-semibold text-sb-text tabular">{money(bagTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sb-text-muted">Shipping</dt>
                <dd className="font-semibold text-sb-text">Free all over India</dd>
              </div>
              <div className="flex justify-between border-t border-sb-gold/30 pt-2.5">
                <dt className="font-display text-lg font-semibold text-sb-heading">Total</dt>
                <dd className="font-display text-lg font-semibold text-sb-heading tabular">
                  {money(bagTotal)}
                </dd>
              </div>
            </dl>

            {/* Held here rather than at checkout, because the button that
                fixes it is on this page. Sending someone to the address form
                to be told a size has gone means sending them back again. */}
            {soldOut.length ? (
              <>
                <p className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-3.5 py-2.5 text-xs leading-relaxed font-medium text-sb-link">
                  <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  {soldOut.length === 1
                    ? `${soldOut[0].name}${soldOut[0].size ? ` in size ${soldOut[0].size}` : ""} sold out while it was in your bag. Remove it to check out.`
                    : `${soldOut.length} pieces above sold out while they were in your bag. Remove them to check out.`}
                </p>
                <span
                  aria-disabled="true"
                  className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-sb-text-muted/40 px-5 py-3.5 text-sm font-semibold text-sb-bg"
                >
                  <Lock className="size-4" aria-hidden="true" />
                  Checkout
                </span>
              </>
            ) : (
              <Link
                href="/checkout"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-5 py-3.5 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
              >
                <Lock className="size-4" aria-hidden="true" />
                Checkout
              </Link>
            )}

            <p className="mt-3 text-xs leading-relaxed text-sb-text-muted">
              No account needed. Nothing is charged at checkout — the shop confirms your order and
              sends a payment link. Payment is online only: GPay, PhonePe, Paytm, cards or net
              banking. No cash on delivery.
            </p>

            {unorderable ? (
              <p className="mt-3 text-xs leading-relaxed font-medium text-sb-link">
                {unorderable === 1
                  ? "One piece above was saved before the shop's catalogue moved and can no longer be ordered."
                  : `${unorderable} pieces above were saved before the shop's catalogue moved and can no longer be ordered.`}{" "}
                Remove them and add them again from the shop.
              </p>
            ) : null}

            {/* Still offered, because some shoppers would simply rather ask a
                person — a question about a fabric, or a size they are unsure
                of. It is no longer how an order is placed. */}
            <a
              href={shop.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-full border border-sb-gold/50 px-5 py-2.5 text-xs font-semibold text-sb-heading transition-colors hover:bg-sb-surface/60"
            >
              <WhatsAppGlyph className="size-3.5" />
              Ask the shop a question
            </a>

            {/* The last screen before checkout where a size can still be
                changed — after this the shopper would have to come back and
                re-add the piece. */}
            <SizeChartButton variant="outline" label="Check the size chart" className="mt-2.5" />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sb-gold/30 pt-4">
              <Link
                href="/shop"
                className="text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
              >
                Keep shopping
              </Link>
              <button
                type="button"
                // Wrapped rather than passed directly: clearBag takes an
                // options object, and a click handler would hand it the
                // event.
                onClick={() => clearBag()}
                className="text-sm text-sb-text-muted underline underline-offset-4 hover:text-sb-link"
              >
                Empty the bag
              </button>
            </div>
          </div>

          {!isSignedIn ? (
            <p className="mt-4 px-1 text-xs leading-relaxed text-sb-text-muted">
              You can order without an account.{" "}
              <button
                type="button"
                onClick={() =>
                  openAuth({ reason: "An account keeps your wishlist across devices." })
                }
                className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
              >
                Sign in
              </button>{" "}
              only if you want your wishlist kept across devices.
            </p>
          ) : null}

          <p className="mt-4 px-1 text-xs leading-relaxed text-sb-text-muted">
            Delivery takes 5 to 10 working days. Every run is limited, so nothing here is reserved
            until the shop confirms it.
          </p>
        </aside>
      </div>
    </section>
  );
}
