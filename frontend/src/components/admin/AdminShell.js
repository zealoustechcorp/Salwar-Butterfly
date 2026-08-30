"use client";

import { LogOut, Menu } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useAdminAuth } from "./AdminAuthProvider";
import { Badge, Button, cx, ToastProvider } from "./ui";

// Admin nav shows only features with screens in this UI — backend-side work
// (F-01 Authentication, F-10 Payment) is not navigable and stays out of the nav.
const FEATURES = [
  /**
   * Categories and Products are live against the API, so they carry no
   * spec badge. The remaining entries below are still FRS placeholders.
   */
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
    ],
  },
  { id: "F-04", label: "Inventory", href: null },
  { id: "F-05", label: "Customers", href: null },
  { id: "F-09", label: "Orders", href: null },
  { id: "F-11", label: "Dashboard & Reports", href: null },
];

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
 * idPrefix keeps Motion layoutIds unique between the two mounted copies of the
 * sidebar (desktop rail + mobile drawer) — shared ids would animate across them.
 */
function Sidebar({ pathname, onNavigate, idPrefix = "rail" }) {
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

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-2 pb-1.5 pt-2 text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
          Features
        </p>
        <ul className="space-y-0.5">
          {FEATURES.map((feature) => {
            const active = feature.href && pathname.startsWith(feature.href);
            if (!feature.href)
              return (
                <li key={feature.label}>
                  <span className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-400">
                    <span className="flex items-center gap-2">
                      {feature.id ? (
                        <span className="font-mono text-[10px] text-ink-300">{feature.id}</span>
                      ) : null}
                      {feature.label}
                    </span>
                    <span className="text-[10px] text-ink-300">later</span>
                  </span>
                </li>
              );
            return (
              <li key={feature.label}>
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
                  {feature.id ? (
                    <span
                      className={cx(
                        "relative font-mono text-[10px]",
                        active ? "text-brand-500" : "text-ink-400",
                      )}
                    >
                      {feature.id}
                    </span>
                  ) : null}
                  <span className="relative">{feature.label}</span>
                </Link>
                {feature.children ? (
                  <ul className="mt-0.5 ml-4 space-y-0.5 border-l border-ink-200 pl-2">
                    {feature.children.map((link) => {
                      const linkActive = link.exact
                        ? pathname === link.href
                        : pathname.startsWith(link.href);
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
                            {link.requirement ? (
                              <span
                                className={cx(
                                  "relative font-mono text-[10px]",
                                  linkActive ? "text-white/50" : "text-ink-300",
                                )}
                              >
                                {link.requirement}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
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
    FEATURES.find((f) => f.href && pathname.startsWith(f.href)) ||
    (pathname.startsWith("/admin/category")
      ? { name: "Categories Management" }
      : { name: "Product Management" });

  const featureTitle =
    currentFeature.name ||
    (currentFeature.label ? `${currentFeature.label} Management` : "Admin Console");
  const featureBadge = currentFeature.id;

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <div className="admin-root flex min-h-screen">
          {/* Desktop static rail */}
          <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white lg:block">
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
                {featureBadge ? <Badge tone="brand">{featureBadge}</Badge> : null}
              </div>
            </header>

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}
