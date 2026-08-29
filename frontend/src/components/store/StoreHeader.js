"use client";

import { ChevronDown, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { WhatsAppGlyph } from "./Ornaments";
import { Photo } from "./Photo";
import { useBrowse } from "./BrowseProvider";
import { useStore } from "./StoreProvider";

const NAV = [
  { id: "new", label: "New In", target: "shop", tab: "new" },
  { id: "offers", label: "Offers", target: "shop", tab: "offers" },
  { id: "almost-gone", label: "Almost Gone", target: "shop", tab: "almost-gone" },
  { id: "story", label: "Our Story", target: "story" },
];

// The shop's own trust badges, in its own words (spelling normalised).
const ANNOUNCEMENTS = [
  "Free shipping all over India",
  "Delivery in 10 working days",
  "GST registered brand · trusted seller",
  "Limited edition — book fast before stock out",
  "WhatsApp support · online payment only",
];

/** Counter bubble on the wishlist / bag icons. Absent until there is a count. */
function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-1 flex min-w-[18px] items-center justify-center rounded-full bg-sb-btn-rose px-1 text-[10px] leading-[18px] font-bold text-sb-bg tabular">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function IconButton({ label, children, count, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative rounded-full p-2 text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-link",
        className,
      )}
    >
      {children}
      <CountBadge count={count} />
    </button>
  );
}

function SearchField({ className, autoFocus = false, onSubmit }) {
  const { query, setQuery, focusShop } = useBrowse();

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        focusShop();
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
        placeholder="Search anarkali, azrak, coord set…"
        aria-label="Search the catalogue"
        className="h-10 w-full rounded-full border border-sb-gold/40 bg-white/70 pr-4 pl-9 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none"
      />
    </form>
  );
}

export function StoreHeader({ categories, shop }) {
  const { bagCount, wishCount } = useStore();
  const { browseCategory, setTab, focusShop, categoryId } = useBrowse();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the category dropdown on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // The drawer owns the scroll while it is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const goToTab = (tab) => {
    if (tab) setTab(tab);
    focusShop();
    setDrawerOpen(false);
  };

  const goToSection = (item) => {
    if (item.target === "shop") return goToTab(item.tab);
    document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setDrawerOpen(false);
  };

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

          <a href="#top" className="flex min-w-0 shrink items-center gap-2 sm:gap-2.5">
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
          </a>

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
                      <button
                        type="button"
                        onClick={() => {
                          browseCategory("all");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-sb-text hover:bg-sb-surface/60"
                      >
                        All collections
                      </button>
                    </li>
                    {categories.map((category) => (
                      <li key={category.id}>
                        <button
                          type="button"
                          onClick={() => {
                            browseCategory(category.id);
                            setMenuOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-sb-surface/60",
                            categoryId === category.id ? "text-sb-link" : "text-sb-text",
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="relative size-7 shrink-0 overflow-hidden rounded-full ring-1 ring-sb-gold/50">
                              <Photo
                                src={category.image}
                                alt=""
                                categoryId={category.id}
                                seed={category.id * 2}
                                sizes="28px"
                                className="object-cover"
                              />
                            </span>
                            {category.name}
                          </span>
                          <span className="text-xs text-sb-text-muted tabular">{category.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSection(item)}
                className="rounded-full px-3 py-2 text-sm font-medium text-sb-text transition-colors hover:bg-sb-surface/70 hover:text-sb-heading"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Icons thin out as the bar narrows: search and account both stay
              reachable from the drawer, the bag never leaves. */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <SearchField className="hidden w-56 xl:block" />
            <IconButton
              label="Search"
              className="hidden sm:inline-flex xl:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Search className="size-5" aria-hidden="true" />
            </IconButton>
            {/* The shop takes questions and size help on WhatsApp — a real
                destination, unlike the account screen F-01 has yet to build. */}
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
            <IconButton label="Wishlist" count={wishCount}>
              <Heart className="size-5" aria-hidden="true" />
            </IconButton>
            <IconButton label="Your bag" count={bagCount}>
              <ShoppingBag className="size-5" aria-hidden="true" />
            </IconButton>
            <IconButton label="Account" className="hidden sm:inline-flex">
              <User className="size-5" aria-hidden="true" />
            </IconButton>
          </div>
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
                    <button
                      type="button"
                      onClick={() => goToSection(item)}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-sb-text hover:bg-sb-surface/60"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>

              <p className="sb-eyebrow px-3 pt-5 pb-2 text-[10px] text-sb-gold-text">Collections</p>
              <ul className="space-y-0.5">
                {categories.map((category) => (
                  <li key={category.id}>
                    <button
                      type="button"
                      onClick={() => {
                        browseCategory(category.id);
                        setDrawerOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] text-sb-text hover:bg-sb-surface/60"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-sb-gold/50">
                          <Photo
                            src={category.image}
                            alt=""
                            categoryId={category.id}
                            seed={category.id * 2}
                            sizes="32px"
                            className="object-cover"
                          />
                        </span>
                        {category.name}
                      </span>
                      <span className="text-xs text-sb-text-muted tabular">{category.count}</span>
                    </button>
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
