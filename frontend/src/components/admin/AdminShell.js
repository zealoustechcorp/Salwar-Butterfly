"use client";

import { LogOut, Menu } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAdminAuth } from "./AdminAuthProvider";
import { Button, cx, ToastProvider } from "./ui";

/**
 * Admin nav: one list of navigable entries, each carrying its own sub-links.
 *
 * Shows only features with screens in this UI — backend-side work
 * (authentication, payment) is not navigable and stays out of the nav.
 *
 * Entries are labels only: spec ids are an internal numbering and are never
 * shown in the UI. Grouping is done by nesting under a real entry the shop
 * can click, never by an inert heading over a run of links — so anything
 * that reads as a parent here is also a screen. Order follows the errand
 * the shop is on, not the alphabet: set the catalogue up, work the day's
 * orders, then the storefront and the numbers.
 */
const FEATURES = [
  // `exact` matters only here: every admin route begins with /admin, so
  // a prefix match would light this entry up on every screen.
  { label: "Dashboard", name: "Dashboard", href: "/admin", exact: true },
  {
    label: "Categories",
    href: "/admin/category",
    children: [
      { href: "/admin/category", label: "All categories", exact: true },
      { href: "/admin/category/new", label: "Add category" },
    ],
  },
  {
    label: "Products",
    href: "/admin/products",
    children: [
      { href: "/admin/products", label: "All products", exact: true },
      { href: "/admin/products/new", label: "Add product" },
      { href: "/admin/products/bulk", label: "Bulk upload" },
      { href: "/admin/products/attributes", label: "Approved attributes" },
      // Inventory and size charts hang under Products despite living at
      // their own top-level routes: both are things the shop edits about a
      // garment, and it reaches for them on the same errand as the product
      // itself. `name` where the header title differs from the rail label.
      { href: "/admin/inventory", label: "Inventory" },
      { href: "/admin/size-charts", label: "Size charts", name: "Size Charts" },
    ],
  },
  // The day's round, read top-down: what came in, who placed it, what they
  // said about it afterwards. Orders is the parent because it is the screen
  // the shop actually opens each morning — the same reason Products parents
  // Inventory rather than a heading doing it.
  {
    label: "Orders",
    href: "/admin/orders",
    children: [
      { href: "/admin/orders", label: "All orders", exact: true },
      { href: "/admin/customers", label: "Customers" },
      { href: "/admin/reviews", label: "Reviews", name: "Reviews & Ratings" },
    ],
  },
  // What the shop puts on the storefront's front page, as opposed to what it
  // sells. Nested because the two screens under it edit the same page and
  // are reached on the same errand.
  {
    label: "Home page",
    name: "Home Page",
    href: "/admin/home",
    children: [
      { href: "/admin/home/carousel", label: "Carousel" },
      { href: "/admin/home/stories", label: "Customer stories" },
    ],
  },
  { label: "Reports", name: "Reports", href: "/admin/reports" },
];

/**
 * Whether a route belongs to a single nav link.
 *
 * Prefix by default, exact where the link says so.
 */
const linkMatches = (link, pathname) =>
  link.exact ? pathname === link.href : pathname.startsWith(link.href);

/**
 * Whether a route belongs to a top-level nav entry.
 *
 * A sub-link that sits outside its parent's route counts too, so the rail
 * still shows which entry you are under while on /admin/inventory. Both the
 * sidebar pill and the header title read from this, so they cannot disagree
 * about which screen you are on.
 */
const featureMatches = (feature, pathname) => {
  if (!feature.href) return false;
  if (linkMatches(feature, pathname)) return true;
  return (feature.children ?? []).some((child) => linkMatches(child, pathname));
};

/**
 * Sub-links living outside their parent's route — Inventory and Size charts.
 *
 * The header title checks these before the top-level entries: a prefix match
 * on the parent would otherwise title /admin/inventory "Products Management".
 */
const CROSS_ROUTE_CHILDREN = FEATURES.flatMap((feature) =>
  (feature.children ?? []).filter((child) => !child.href.startsWith(feature.href)),
);

/** "Dharun Prakash J A" → "DA"; falls back to the email's first letter. */
function initialsOf(name, email) {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return String(email ?? "?")
      .charAt(0)
      .toUpperCase();
  }

  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";

  return (first + last).toUpperCase();
}

const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
};

/**
 * The signed-in admin, read from the session rather than hardcoded.
 *
 * Renders nothing when there is no admin — the panel is behind
 * RequireAdmin, so that state is only ever momentary.
 */
function AdminUserCard() {
  const { admin, signOut } = useAdminAuth();
  const [busy, setBusy] = useState(false);

  if (!admin) return null;

  return (
    <div className="border-t border-ink-200 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-800">
          {initialsOf(admin.name, admin.email)}
        </span>

        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-medium text-ink-800">
            {admin.name}
          </p>
          <p className="truncate text-[11px] text-ink-500">
            {ROLE_LABELS[admin.role] ?? admin.role}
          </p>
        </div>

        <Button
          size="sm"
          variant="ghost"
          busy={busy}
          aria-label="Sign out"
          title="Sign out"
          className="shrink-0 px-1.5"
          onClick={async () => {
            setBusy(true);
            await signOut();
            // No need to reset `busy` — RequireAdmin unmounts this.
          }}
        >
          {busy ? null : <LogOut className="size-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Which edges of a scroll container still have content beyond them, as
 * `data-fade-*` attributes for `.admin-scroll-hint` to fade.
 *
 * Admin scrollbars are hidden (globals.css), so without this a rail taller
 * than the viewport is cut off flat and reads as the end of the list. Driven
 * by the element rather than by a media query because the cutoff depends on
 * viewport height, nav length and browser chrome all at once.
 *
 * A ResizeObserver covers the cases a scroll listener cannot see: the window
 * resizing, and the drawer's own open animation settling into its final height.
 */
function useScrollEdges() {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      // 1px slack: fractional device-pixel ratios leave sub-pixel remainders
      // at the ends, which would otherwise pin the fade on permanently.
      setEdges({
        top: scrollTop > 1,
        bottom: scrollTop + clientHeight < scrollHeight - 1,
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return [ref, edges];
}

/**
 * One top-level nav entry, with its sub-links when it has any.
 *
 * Split out of Sidebar so the group loop stays readable now that the rail
 * nests three levels deep (group → entry → sub-link).
 */
function NavEntry({ feature, pathname, onNavigate, idPrefix }) {
  const active = featureMatches(feature, pathname);

  // An entry without an href is a feature that has no screen yet.
  if (!feature.href) {
    return (
      <li>
        <span className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-400">
          <span className="flex items-center gap-2">{feature.label}</span>
          <span className="text-[10px] text-ink-300">later</span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={feature.href}
        onClick={onNavigate}
        className={cx(
          "relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          active ? "text-brand-700" : "text-ink-700 hover:bg-ink-100",
        )}
      >
        {active ? (
          <motion.span
            layoutId={`${idPrefix}-feature-pill`}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
            className="absolute inset-0 rounded-lg bg-brand-50"
            aria-hidden="true"
          />
        ) : null}
        <span className="relative">{feature.label}</span>
      </Link>

      {feature.children ? (
        <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-ink-200 pl-2">
          {feature.children.map((link) => {
            const linkActive = linkMatches(link, pathname);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className={cx(
                    "relative flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    linkActive
                      ? "text-white"
                      : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                  )}
                >
                  {linkActive ? (
                    <motion.span
                      layoutId={`${idPrefix}-sublink-pill`}
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      className="absolute inset-0 rounded-lg bg-ink-900"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="relative">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * idPrefix keeps Motion layoutIds unique between the two mounted copies of the
 * sidebar (desktop rail + mobile drawer) — shared ids would animate across them.
 */
function Sidebar({ pathname, onNavigate, idPrefix = "rail" }) {
  const [navRef, navEdges] = useScrollEdges();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image
          src="/Salwar Butterfly.jpeg"
          alt="Salwar Butterfly logo"
          width={40}
          height={40}
          className="size-10 rounded-lg ring-1 ring-brand-200"
        />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold text-brand-800">Salwar Butterfly</p>
          <p className="text-[11px] text-ink-500">Admin console</p>
        </div>
      </div>

      {/* overscroll-contain: hitting the end of the rail must not start
          scrolling the page behind it. admin-scroll-hint restores the "there
          is more below" cue that hiding the scrollbar removed. */}
      <nav
        ref={navRef}
        data-fade-top={navEdges.top}
        data-fade-bottom={navEdges.bottom}
        className="admin-scroll-hint flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-1"
        aria-label="Admin sections"
      >
        {/* space-y-1 rather than the sub-links' 0.5: top-level entries need a
            little more air between them now that nesting is the only thing
            separating one section of the rail from the next. */}
        <ul className="space-y-1">
          {FEATURES.map((feature) => (
            <NavEntry
              key={feature.label}
              feature={feature}
              pathname={pathname}
              onNavigate={onNavigate}
              idPrefix={idPrefix}
            />
          ))}
        </ul>
      </nav>

      <AdminUserCard />
    </div>
  );
}

export function AdminShell({ children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentFeature =
    CROSS_ROUTE_CHILDREN.find((c) => linkMatches(c, pathname)) ||
    FEATURES.find((f) => featureMatches(f, pathname)) ||
    (pathname.startsWith("/admin/category")
      ? { name: "Categories Management" }
      : { name: "Product Management" });

  const featureTitle =
    currentFeature.name ||
    (currentFeature.label ? `${currentFeature.label} Management` : "Admin Console");

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="admin-root flex min-h-screen">
          {/* Desktop static rail — pinned to the viewport so the sign-out card
              stays reachable instead of riding the bottom of a long page. */}
          <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen">
            <Sidebar pathname={pathname} idPrefix="rail" />
          </aside>

          {/* Mobile drawer */}
          <AnimatePresence>
            {drawerOpen ? (
              <motion.div
                initial="closed"
                animate="open"
                exit="closed"
                className="fixed inset-0 z-40 lg:hidden"
              >
                <motion.div
                  variants={{ closed: { opacity: 0 }, open: { opacity: 1 } }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute inset-0 bg-ink-900/40"
                  onClick={() => setDrawerOpen(false)}
                  aria-hidden="true"
                />
                <motion.div
                  variants={{ closed: { x: "-100%" }, open: { x: 0 } }}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl"
                >
                  <Sidebar
                    pathname={pathname}
                    onNavigate={() => setDrawerOpen(false)}
                    idPrefix="drawer"
                  />
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-ink-900">{featureTitle}</span>
              </div>
            </header>

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}
