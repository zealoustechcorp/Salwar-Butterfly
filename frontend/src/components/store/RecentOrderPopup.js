"use client";

/**
 * "Someone from Chennai just bought Anarkali Set" (F-09.09).
 *
 * A small card in the bottom-left corner that cycles through recent paid
 * orders. The whole card is a link to that piece's page. The ✕ closes the
 * card on screen only and the cycle carries on, so the shop's switch in the
 * admin panel is the one way to turn it off.
 *
 * Two display modes, chosen by the shop:
 *
 *   until_closed  a card stays until the shopper clicks the ✕;
 *   timer         a card hides itself after the shop's "show for" seconds
 *                 (or sooner, if the shopper clicks the ✕).
 *
 * One gap for everything else: whenever a card goes — timer or ✕ — the
 * next comes the shop's "next pop-up after" seconds later, and the first
 * card after a page loads waits the same.
 *
 * An order with several pieces is still one card. It names the first piece
 * and adds a "+ N more" chip; tapping the chip opens a short list of the
 * others (at most three, the API's cut), each a link to its own page, with
 * a line counting any beyond that. While the list is open the card holds
 * still: the timer and its bar pause, and the cycle waits. Hiding the list
 * resumes the timer where it stopped. Tapping a piece opens its page and
 * closes the card. Escape hides the list.
 *
 * Fits every screen: full width less a gutter on phones (clear of the notch
 * and home bar), a fixed narrow card from tablets up; the open list scrolls
 * inside the card on short landscape screens rather than running off them.
 *
 * Motion (keyframes in globals.css): a card rises in, sinks out when its
 * time is up, and slides off to the left when closed. A thin bar along its
 * foot empties over the time it stays. All of it is switched off for
 * shoppers who ask their device for reduced motion.
 *
 * Read from `GET /storefront/getRecentOrders` in the browser rather than at
 * render, so a cached page never shows a stale "2 minutes ago" and the
 * shop's switch takes effect without a rebuild. Switched off, the read
 * returns no orders and this renders nothing.
 *
 * The only customer detail the API sends is the city — the shop chose
 * "Someone from <city>" — so there is nothing here to hide.
 *
 * Not shown on the bag, checkout or account pages: a shopper paying or
 * checking an order should not have a card sliding in over the form.
 */

import { ChevronDown, ChevronRight, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/** The length of the leave animations (.sb-popup-out / .sb-popup-dismiss). */
const EXIT_MS = 300;

/** Path prefixes where the pop-up never appears. */
const HIDDEN_ON = ["/bag", "/checkout", "/account"];

const hiddenOn = (pathname) =>
  HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const PHASE_CLASS = {
  in: "sb-popup-in",
  out: "sb-popup-out",
  dismiss: "sb-popup-dismiss",
};

/** "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
function timeAgo(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const pieces = (count) => `${count} more piece${count === 1 ? "" : "s"}`;

/** A small square photograph, or the bag icon where a piece has none. */
function Photo({ src, size, className }) {
  return (
    <span className={cn("relative shrink-0 overflow-hidden bg-sb-surface", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes={size} className="object-cover" />
      ) : (
        <ShoppingBag className="absolute inset-0 m-auto size-1/3 text-sb-heading" aria-hidden="true" />
      )}
    </span>
  );
}

/** Older API builds send no `more`; read them as one-piece orders. */
function normaliseOrder(order) {
  const more = Array.isArray(order.more) ? order.more.filter((item) => item?.slug && item?.name) : [];
  return {
    ...order,
    more,
    moreCount: Math.max(Number(order.moreCount) || 0, more.length),
  };
}

export function RecentOrderPopup() {
  const pathname = usePathname() ?? "/";
  const hidden = hiddenOn(pathname);

  const [feed, setFeed] = useState(null);
  // { order, key } — `key` is new for every showing, so the enter
  // animation replays even when the list has one order and it repeats.
  const [current, setCurrent] = useState(null);
  const [phase, setPhase] = useState("in");
  // Bumped once a closed card has slid away. A new value restarts the
  // cycle below, so the next card comes the shop's gap after the close.
  const [restart, setRestart] = useState(0);
  // The "+ N more" list. Open, it holds the card still.
  const [open, setOpen] = useState(false);

  const indexRef = useRef(0);
  const shownRef = useRef(0);
  const timersRef = useRef([]);
  // Timer mode: when the card is due to go, and how long it had left when
  // the list opened — so hiding the list resumes rather than restarts.
  const deadlineRef = useRef(0);
  const remainingRef = useRef(0);
  const showNextRef = useRef(null);
  const chipRef = useRef(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const later = useCallback((fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  // Read once per visit to the storefront, not on every navigation: the
  // layout keeps this component mounted across pages.
  useEffect(() => {
    const controller = new AbortController();

    fetch(`${API_BASE}/storefront/getRecentOrders`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const data = payload?.data;
        if (data?.enabled && Array.isArray(data.orders) && data.orders.length) {
          setFeed({
            untilClosed: data.displayMode === "until_closed",
            orders: data.orders
              .filter((order) => order?.product?.slug && order?.city)
              .map(normaliseOrder),
            visibleMs: Math.max(3, Number(data.visibleSeconds ?? 6)) * 1000,
            gapMs: Math.max(1, Number(data.gapSeconds ?? 5)) * 1000,
          });
        }
      })
      .catch(() => {
        // A pop-up that fails to load is a page without a pop-up. Nothing to tell the shopper.
      });

    return () => controller.abort();
  }, []);

  // Timer mode: sink out after `ms`, then bring the next card one gap later.
  const hideAfter = useCallback(
    (ms) => {
      if (!feed) return;
      deadlineRef.current = Date.now() + ms;
      later(() => setPhase("out"), ms);
      later(() => {
        setCurrent(null);
        later(() => showNextRef.current?.(), feed.gapMs);
      }, ms + EXIT_MS);
    },
    [feed, later],
  );

  // The cycle: wait the gap, rise in, then either stay (until closed) or
  // sink out after the shop's on-screen time (timer). Whenever a card goes —
  // timer or ✕ — the next comes one gap later. The first card after a page
  // loads waits the same gap. Paused (and hidden) on the pages it stays off.
  useEffect(() => {
    if (!feed?.orders.length || hidden) return undefined;

    const showNext = () => {
      const order = feed.orders[indexRef.current % feed.orders.length];
      indexRef.current += 1;
      shownRef.current += 1;

      setOpen(false);
      setPhase("in");
      setCurrent({ order, key: shownRef.current });

      // Stay-until-closed: nothing more to schedule. The ✕ restarts the
      // cycle, which brings the next card one gap later.
      if (feed.untilClosed) return;

      hideAfter(feed.visibleMs);
    };

    showNextRef.current = showNext;
    later(showNext, feed.gapMs);

    return () => {
      clearTimers();
      showNextRef.current = null;
      setCurrent(null);
      setOpen(false);
    };
  }, [feed, hidden, restart, later, clearTimers, hideAfter]);

  // Slide it away first, then restart the cycle once it has gone.
  const dismiss = useCallback(() => {
    clearTimers();
    setPhase("dismiss");
    later(() => setRestart((n) => n + 1), EXIT_MS);
  }, [clearTimers, later]);

  // Open: hold the card still. Hidden again: carry on where it stopped.
  const toggleMore = useCallback(() => {
    if (phase !== "in") return;

    if (!open) {
      clearTimers();
      remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
      setOpen(true);
      return;
    }

    setOpen(false);
    if (!feed.untilClosed) hideAfter(Math.max(remainingRef.current, 600));
  }, [phase, open, feed, clearTimers, hideAfter]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        toggleMore();
        chipRef.current?.focus();
      }
    },
    [open, toggleMore],
  );

  if (!current || hidden) return null;

  const { city, product, orderedAt, more, moreCount } = current.order;
  const ago = timeAgo(orderedAt);
  const unlisted = Math.max(0, moreCount - more.length);
  const listId = `recent-order-more-${current.key}`;

  return (
    <div
      className={cn(
        "fixed z-[55] max-w-xs sm:max-w-[22rem]",
        // Clear of the notch, the rounded corners and the home bar.
        "bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))]",
        "sm:bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:left-[max(1.25rem,env(safe-area-inset-left))]",
      )}
    >
      <div
        key={current.key}
        onKeyDown={onKeyDown}
        className={cn(
          "relative overflow-hidden rounded-2xl bg-sb-bg shadow-lg shadow-sb-footer/20 ring-1 ring-sb-surface",
          PHASE_CLASS[phase],
        )}
      >
        <div role="status" aria-live="polite" className="p-2.5 pr-11 sm:pr-9">
          <Link
            href={productPath(product)}
            onClick={open ? dismiss : undefined}
            className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
            aria-label={`Someone from ${city} bought ${product.name}${
              moreCount ? ` and ${pieces(moreCount)}` : ""
            }${ago ? `, ${ago}` : ""}. View ${product.name}.`}
          >
            <Photo src={product.image} size="56px" className="size-14 rounded-xl" />
            <span className="min-w-0 text-sm leading-snug text-sb-text">
              <span className="block truncate text-xs text-sb-text-muted">Someone from {city}</span>
              <span className="line-clamp-2">
                just bought <span className="font-semibold text-sb-heading">{product.name}</span>
              </span>
              {ago ? <span className="mt-0.5 block text-xs text-sb-gold-text">{ago}</span> : null}
            </span>
          </Link>

          {moreCount ? (
            // Lined up under the text, beside the photo.
            <div className="mt-1.5 pl-[4.25rem]">
              <button
                ref={chipRef}
                type="button"
                onClick={toggleMore}
                aria-expanded={open}
                aria-controls={more.length ? listId : undefined}
                aria-label={`${pieces(moreCount)} from this order`}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-sb-surface/50 px-3 text-xs font-semibold text-sb-link transition-colors hover:bg-sb-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link sm:min-h-7 sm:px-2.5"
              >
                {open ? "Hide" : `+ ${moreCount} more`}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : null}
        </div>

        {open ? (
          <div
            id={listId}
            className="sb-enter max-h-[min(13.5rem,38dvh)] overflow-y-auto overscroll-contain border-t border-sb-surface px-1.5 pt-1.5 pb-2.5"
          >
            {more.length ? (
              <ul className="grid gap-0.5">
                {more.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={productPath(item)}
                      onClick={dismiss}
                      className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1 text-sm text-sb-text transition-colors hover:bg-sb-surface/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sb-link"
                    >
                      <Photo src={item.image} size="40px" className="size-10 rounded-lg" />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-sb-link" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {unlisted ? (
              <p className="px-2 pt-1 text-xs text-sb-text-muted">
                and {pieces(unlisted)} in this order
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close this notification"
          className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full text-sb-text-muted transition-colors hover:bg-sb-surface/60 focus-visible:outline-2 focus-visible:outline-sb-link sm:right-1.5 sm:top-1.5 sm:size-7"
        >
          <X className="size-4 sm:size-3.5" aria-hidden="true" />
        </button>

        {/* Time left on screen, in timer mode only. Decorative: the card
            leaves by itself. Holds still while the list is open. */}
        {feed.untilClosed ? null : (
          <span
            aria-hidden="true"
            className="sb-popup-progress absolute inset-x-0 bottom-0 h-0.5 bg-sb-gold"
            style={{
              animationDuration: `${feed.visibleMs}ms`,
              animationPlayState: open ? "paused" : "running",
            }}
          />
        )}
      </div>
    </div>
  );
}
