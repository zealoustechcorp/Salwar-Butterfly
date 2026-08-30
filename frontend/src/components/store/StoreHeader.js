"use client";

import { ChevronDown, Heart, LogOut, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { WhatsAppGlyph } from "./Ornaments";
import { Photo } from "./Photo";
import { useAuth } from "./AuthProvider";
import { useBrowse } from "./BrowseProvider";
import { useStore } from "./StoreProvider";

/**
 * Every entry is a real href, not a scroll target: the header sits in the
 * storefront layout and so renders on `/bag` and `/account` too, where there is
 * no shop grid on the page to scroll to. `/shop` reads these query strings back
 * out through <ShopFilterSync>.
 */
const NAV = [
  { id: "new", label: "New In", href: "/shop?tab=new" },
  { id: "offers", label: "Offers", href: "/shop?tab=offers" },
  { id: "almost-gone", label: "Almost Gone", href: "/shop?tab=almost-gone" },
  // The story lives on the home page; the absolute path keeps the anchor
  // working from the other routes as well.
  { id: "story", label: "Our Story", href: "/#story" },
];

// The shop's own trust badges, in its own words (spelling normalised).
const ANNOUNCEMENTS = [
  "Free shipping all over India",
  "Delivery in 5–10 working days",
  "GST registered brand · trusted seller",
  "Limited edition — book fast before stock out",
  "WhatsApp support · online payment only",
];

/**
 * Closes a popover on an outside pointer press or on Escape, and hands back the
 * ref to put on it. The category dropdown and the account menu both want
 * exactly this behaviour.
 */
function useDismissable(open, close) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return ref;
}

/** Counter bubble on the wishlist / bag icons. Absent until there is a count. */
function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full bg-sb-btn-rose px-1 text-[10px] leading-[18px] font-bold text-sb-bg tabular">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const ICON_CLASS =
  "relative rounded-full p-2 text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link";

function IconButton({ label, children, count, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(ICON_CLASS, className)}
    >
      {children}
      <CountBadge count={count} />
    </button>
  );
}

function IconLink({ label, href, children, count, active, className }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(ICON_CLASS, active && "bg-sb-surface/70 text-sb-heading", className)}
    >
      {children}
      <CountBadge count={count} />
    </Link>
  );
}

/**
 * The words the search prompt cycles through.
 *
 * Every one of them was checked against the committed catalogue and comes back
 * with results — <ProductShowcase> matches a query against the product name,
 * its category and its fabric, and these are the words the shop itself uses in
 * all three. A placeholder is a suggestion, and suggesting a search that lands
 * on an empty grid is worse than suggesting nothing.
 *
 * "dress" is deliberately absent. It is the shop's own word for what it sells —
 * it is in the logo — but no product name, category or fabric in the snapshot
 * contains it, so offering it here would send shoppers to nothing.
 */
const SEARCH_TERMS = [
  "dhabu cotton",
  "anarkali",
  "coord set",
  "azrak",
  "straight cut",
  "chanderi silk",
  "kurti",
];

const ROTATE_MS = 2400;

/**
 * Steps through `terms` on a timer, and stands still for anyone who asked for
 * less motion. Always starts at the first term, so the server render and its
 * hydration agree before the timer has ticked once.
 */
function useRotatingTerm(terms, paused) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % terms.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [terms, paused]);

  return terms[index];
}

/**
 * Typing filters whatever grid is on screen straight away; submitting commits
 * the term to `/shop`, so it survives a reload and can be shared.
 */
function SearchField({ className, autoFocus = false, onSubmit }) {
  const { query, setQuery } = useBrowse();
  const router = useRouter();
  // Nothing to prompt for once they have started typing — and the overlay is
  // hidden then anyway, so the timer may as well stop.
  const term = useRotatingTerm(SEARCH_TERMS, Boolean(query));

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const submitted = query.trim();
        router.push(submitted ? `/shop?q=${encodeURIComponent(submitted)}` : "/shop");
        onSubmit?.();
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sb-text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        // The visible prompt is the overlay below, because a `placeholder`
        // attribute cannot animate. The accessible name stays fixed, so a
        // screen reader is never read a moving target.
        placeholder=""
        aria-label="Search the catalogue"
        className="h-10 w-full rounded-full border border-sb-gold/40 bg-white/70 pr-4 pl-9 text-sm text-sb-text focus:border-sb-link focus:bg-white focus:outline-none"
      />
      {query ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-4 left-9 flex items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap text-sb-text-muted/60"
        >
          Search for
          {/* Keyed on the term so the swap replays `sb-enter`, which globals.css
              already switches off under prefers-reduced-motion. */}
          <span key={term} className="sb-enter font-medium text-sb-text-muted">
            {term}
          </span>
        </span>
      )}
    </form>
  );
}

/**
 * The person icon. Signed out it opens the dialog rather than navigating —
 * `/account` is the one route that needs an account, so sending a guest there
 * only to bounce them back would be a wasted trip. Signed in it becomes the
 * shopper's initial and a small menu.
 */
function AccountControl({ className }) {
  const { user, isSignedIn, signOut, openAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismissable(open, close);
  const pathname = usePathname();

  if (!isSignedIn) {
    return (
      <IconButton
        label="Sign in"
        className={className}
        onClick={() =>
          openAuth({
            reason: "Sign in to open your account.",
            redirectTo: "/account",
          })
        }
      >
        <User className="size-5" aria-hidden="true" />
      </IconButton>
    );
  }

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        title={user.name}
        className="flex size-9 items-center justify-center rounded-full bg-sb-heading text-sm font-bold text-sb-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link"
      >
        {initial}
      </button>

      {open ? (
        <div className="sb-enter absolute top-full right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-sb-gold/35 bg-sb-bg shadow-xl shadow-sb-footer/10">
          <div className="border-b border-sb-gold/25 px-4 py-3">
            <p className="truncate font-display text-base font-semibold text-sb-heading">
              {user.name}
            </p>
            <p className="truncate text-xs text-sb-text-muted">{user.email}</p>
          </div>
          <ul className="p-1.5">
            {[
              { href: "/account", label: "Your account", icon: User },
              { href: "/wishlist", label: "Your wishlist", icon: Heart },
            ].map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={close}
                  aria-current={pathname === href ? "page" : undefined}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-sb-text transition-colors hover:bg-sb-surface/60"
                >
                  <Icon className="size-4 text-sb-gold-text" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => {
                  close();
                  signOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-sb-text transition-colors hover:bg-sb-surface/60"
              >
                <LogOut className="size-4 text-sb-gold-text" aria-hidden="true" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function StoreHeader({ categories, shop }) {
  const { bagCount, wishCount } = useStore();
  const { user, isSignedIn, signOut, openAuth } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useDismissable(menuOpen, closeMenu);
  const pathname = usePathname();

  // The drawer owns the scroll while it is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // Every link inside the drawer and the dropdown closes its own overlay on
  // click, so there is no route-change effect to reconcile here.

  return (
    <header className="sticky top-0 z-40">
      {/* Announcement rail — two identical tracks so the loop is seamless. */}
      <div className="overflow-hidden bg-sb-footer py-1 text-sb-bg sm:py-1.5">
        <div className="sb-marquee flex w-max gap-8 pr-8 sm:gap-10 sm:pr-10">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-8 sm:gap-10" aria-hidden={copy === 1}>
              {ANNOUNCEMENTS.map((line) => (
                <span key={line} className="sb-eyebrow text-[10px] whitespace-nowrap">
                  {line}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-sb-gold/30 bg-sb-bg/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:h-16 sm:gap-3 sm:px-6 lg:h-18 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="-ml-2 rounded-full p-2 text-sb-text hover:bg-sb-surface/70 lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <Link href="/" className="flex min-w-0 shrink items-center gap-2 sm:gap-2.5">
            <Image
              src="/Salwar Butterfly.jpeg"
              alt="Salwar Butterfly"
              width={48}
              height={48}
              priority
              className="size-9 shrink-0 rounded-full ring-1 ring-sb-gold/50 sm:size-10 lg:size-11"
            />
            <span className="min-w-0 leading-none">
              <span className="block truncate font-display text-base leading-tight font-semibold text-sb-heading sm:text-lg lg:text-xl">
                {shop.name}
              </span>
              <span className="sb-eyebrow block truncate text-[8px] text-sb-gold-text sm:text-[9px]">
                {shop.tagline}
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex xl:ml-6">
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading"
              >
                Shop by Category
                <ChevronDown
                  className={cn("size-4 transition-transform", menuOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>

              {menuOpen ? (
                <div className="sb-enter absolute top-full left-0 mt-2 w-80 overflow-hidden rounded-2xl border border-sb-gold/35 bg-sb-bg shadow-xl shadow-sb-footer/10">
                  <p className="sb-eyebrow border-b border-sb-gold/25 px-4 py-2.5 text-[10px] text-sb-gold-text">
                    The Collections
                  </p>
                  <ul className="p-1.5">
                    <li>
                      <Link
                        href="/shop"
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-sb-text hover:bg-sb-surface/60"
                      >
                        All collections
                      </Link>
                    </li>
                    {categories.map((category) => (
                      <li key={category.id}>
                        <Link
                          href={`/shop?category=${category.id}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-sb-text transition-colors hover:bg-sb-surface/60"
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="relative size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-sb-gold/50">
                              <Photo
                                src={category.image}
                                alt=""
                                categoryName={category.name}
                                seed={category.id * 2}
                                sizes="28px"
                                className="object-cover"
                              />
                            </span>
                            {category.name}
                          </span>
                          <span className="text-xs text-sb-text-muted tabular">{category.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/*
            Fills the gap the nav leaves, rather than sitting inside the icon
            cluster: `flex-1` means it takes whatever the wordmark, the nav and
            the icons have not claimed, so it grows with the window instead of
            being pinned to one width. Below `wide` that gap is too narrow to
            type in, and it drops to its own row under the bar.
          */}
          <SearchField className="mx-3 hidden max-w-sm min-w-0 flex-1 wide:block" />

          {/* Icons thin out as the bar narrows: account stays reachable from the
              drawer, the bag never leaves. Search does not thin out at all — it
              only changes rows. */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* The shop takes questions and size help on WhatsApp. */}
            <a
              href={shop.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Chat with the shop on WhatsApp"
              title="Chat on WhatsApp"
              className="hidden rounded-full p-2 text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading sm:inline-flex"
            >
              <WhatsAppGlyph className="size-5" />
            </a>
            <IconLink
              label="Wishlist"
              href="/wishlist"
              count={wishCount}
              active={pathname === "/wishlist"}
            >
              <Heart className="size-5" aria-hidden="true" />
            </IconLink>
            <IconLink label="Your bag" href="/bag" count={bagCount} active={pathname === "/bag"}>
              <ShoppingBag className="size-5" aria-hidden="true" />
            </IconLink>
            <AccountControl className="ml-0.5 hidden sm:inline-flex" />
          </div>
        </div>

        {/*
          Below `wide` the top bar has no room left for a field wide enough to
          type in, so the search gets its own full-width row rather than
          collapsing into an icon. It is the shop's primary way in — 197 pieces
          across five categories — and a search you have to go looking for is
          one nobody uses. Anything keyed to the header's height (`scroll-mt`,
          the bag's sticky summary) carries the matching wide: breakpoint.
        */}
        <div className="mx-auto max-w-7xl px-4 pb-2.5 sm:px-6 lg:px-8 wide:hidden">
          <SearchField />
        </div>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-sb-footer/45"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="sb-enter absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-sb-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-sb-gold/30 px-5 py-4">
              <span className="font-display text-xl font-semibold text-sb-heading">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-full p-2 text-sb-text hover:bg-sb-surface/70"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-sb-gold/25 px-5 py-4">
              <SearchField onSubmit={() => setDrawerOpen(false)} />
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-0.5">
                {NAV.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className="block w-full rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-sb-text hover:bg-sb-surface/60"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              {/* The account icon is desktop-only, so the drawer is where all of
                  this has to be reachable on a phone. */}
              <p className="sb-eyebrow px-3 pt-5 pb-2 text-[10px] text-sb-gold-text">
                {isSignedIn ? user.name : "You"}
              </p>
              <ul className="space-y-0.5">
                {[
                  { href: "/wishlist", label: "Wishlist", count: wishCount, icon: Heart },
                  { href: "/bag", label: "Your bag", count: bagCount, icon: ShoppingBag },
                ].map(({ href, label, count, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="size-4 text-sb-gold-text" aria-hidden="true" />
                        {label}
                      </span>
                      {count ? (
                        <span className="text-xs text-sb-text-muted tabular">{count}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}

                {isSignedIn ? (
                  <>
                    <li>
                      <Link
                        href="/account"
                        onClick={() => setDrawerOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                      >
                        <User className="size-4 text-sb-gold-text" aria-hidden="true" />
                        Account
                      </Link>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setDrawerOpen(false);
                          signOut();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                      >
                        <LogOut className="size-4 text-sb-gold-text" aria-hidden="true" />
                        Sign out
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerOpen(false);
                        openAuth({
                          reason: "Sign in to open your account.",
                          redirectTo: "/account",
                        });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                    >
                      <User className="size-4 text-sb-gold-text" aria-hidden="true" />
                      Sign in
                    </button>
                  </li>
                )}
              </ul>

              <p className="sb-eyebrow px-3 pt-5 pb-2 text-[10px] text-sb-gold-text">Collections</p>
              <ul className="space-y-0.5">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/shop?category=${category.id}`}
                      onClick={() => setDrawerOpen(false)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-sb-gold/50">
                          <Photo
                            src={category.image}
                            alt=""
                            categoryName={category.name}
                            seed={category.id * 2}
                            sizes="32px"
                            className="object-cover"
                          />
                        </span>
                        {category.name}
                      </span>
                      <span className="text-xs text-sb-text-muted tabular">{category.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
