"use client";

/**
 * "Someone from Chennai just bought Anarkali Set" (F-09.09).
 *
 * A small card in the bottom-left corner that cycles through recent paid
 * orders. The whole card is a link to that piece's page. The ✕ closes the
 * card on screen only: the next order arrives after the shop's closing delay and the
 * cycle carries on, so the shop's switch in the admin panel is the one way
 * to turn it off.
 *
 * Two display modes, chosen by the shop:
 *
 *   timer         each card hides itself after the shop's on-screen time,
 *                 and the next comes on the shop's interval;
 *   until_closed  a card stays until the shopper clicks the ✕.
 *
 * In both, the first card comes 5 seconds after a page loads, and closing
 * one brings the next after the shop's closing delay.
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

import { ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { productPath } from "@/lib/store/links";
import { cn } from "@/lib/utils";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

/**
 * How long after a page loads the first card appears. Fixed, not a
 * setting. (After a close, the shop's closing delay is used instead.)
 */
const FIRST_DELAY_MS = 5000;

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

export function RecentOrderPopup() {
  const pathname = usePathname() ?? "/";
  const hidden = hiddenOn(pathname);

  const [feed, setFeed] = useState(null);
  // { order, key } — `key` is new for every showing, so the enter
  // animation replays even when the list has one order and it repeats.
  const [current, setCurrent] = useState(null);
  const [phase, setPhase] = useState("in");
  // Bumped once a closed card has slid away. A new value restarts the
  // cycle below, so the next card comes the closing delay after the close.
  const [restart, setRestart] = useState(0);
  // Whether the next restart of the cycle is because of a close, so it
  // waits the closing delay rather than the first-load 5 seconds.
  const afterCloseRef = useRef(false);

  const indexRef = useRef(0);
  const shownRef = useRef(0);
  const timersRef = useRef([]);

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
          const visibleMs = Math.max(3, Number(data.visibleSeconds ?? 6)) * 1000;
          setFeed({
            untilClosed: data.displayMode === "until_closed",
            orders: data.orders.filter((order) => order?.product?.slug && order?.city),
            visibleMs,
            // Never let a card arrive before the last one has left.
            intervalMs: Math.max(visibleMs + EXIT_MS, Number(data.intervalSeconds ?? 20) * 1000),
            closeDelayMs: Math.max(1, Number(data.closeDelaySeconds ?? 5)) * 1000,
          });
        }
      })
      .catch(() => {
        // A pop-up that fails to load is a page without a pop-up. Nothing to tell the shopper.
      });

    return () => controller.abort();
  }, []);

  // The cycle: wait 5 seconds, rise in, stay for the shop's on-screen time,
  // sink out, wait out the rest of the interval, show the next. Closing a
  // card restarts it from the 5-second wait, moving on to the next order.
  // Paused (and the card hidden) on the pages it stays off.
  useEffect(() => {
    if (!feed?.orders.length || hidden) return undefined;

    const showNext = () => {
      const order = feed.orders[indexRef.current % feed.orders.length];
      indexRef.current += 1;
      shownRef.current += 1;

      setPhase("in");
      setCurrent({ order, key: shownRef.current });

      // Stay-until-closed: nothing more to schedule. The ✕ restarts the
      // cycle, which brings the next card the closing delay later.
      if (feed.untilClosed) return;

      later(() => setPhase("out"), feed.visibleMs);
      later(() => setCurrent(null), feed.visibleMs + EXIT_MS);
      later(showNext, feed.intervalMs);
    };

    const firstDelay = afterCloseRef.current ? feed.closeDelayMs : FIRST_DELAY_MS;
    afterCloseRef.current = false;
    later(showNext, firstDelay);

    return () => {
      clearTimers();
      setCurrent(null);
    };
  }, [feed, hidden, restart, later, clearTimers]);

  // Slide it away first, then restart the cycle once it has gone.
  const dismiss = useCallback(() => {
    clearTimers();
    setPhase("dismiss");
    later(() => {
      afterCloseRef.current = true;
      setRestart((n) => n + 1);
    }, EXIT_MS);
  }, [clearTimers, later]);

  if (!current || hidden) return null;

  const { city, product, orderedAt } = current.order;
  const ago = timeAgo(orderedAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[55] w-[calc(100%-2rem)] max-w-xs sm:bottom-5 sm:left-5"
    >
      <div
        key={current.key}
        className={cn(
          "relative flex items-center gap-3 overflow-hidden rounded-2xl bg-sb-bg p-2.5 pr-9 shadow-lg shadow-sb-footer/20 ring-1 ring-sb-surface",
          PHASE_CLASS[phase],
        )}
      >
        <Link
          href={productPath(product)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
          aria-label={`Someone from ${city} bought ${product.name}${ago ? `, ${ago}` : ""}. View the product.`}
        >
          <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-sb-surface">
            {product.image ? (
              <Image src={product.image} alt="" fill sizes="56px" className="object-cover" />
            ) : (
              <ShoppingBag className="absolute inset-0 m-auto size-5 text-sb-heading" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 text-sm leading-snug text-sb-text">
            <span className="block text-xs text-sb-text-muted">Someone from {city}</span>
            <span className="block">
              just bought <span className="font-semibold text-sb-heading">{product.name}</span>
            </span>
            {ago ? <span className="mt-0.5 block text-xs text-sb-gold-text">{ago}</span> : null}
          </span>
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close this notification"
          className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-sb-text-muted transition-colors hover:bg-sb-surface/60 focus-visible:outline-2 focus-visible:outline-sb-link"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>

        {/* Time left on screen, in timer mode only. Decorative: the card
            leaves by itself. */}
        {feed.untilClosed ? null : (
          <span
            aria-hidden="true"
            className="sb-popup-progress absolute inset-x-0 bottom-0 h-0.5 bg-sb-gold"
            style={{ animationDuration: `${feed.visibleMs}ms` }}
          />
        )}
      </div>
    </div>
  );
}
