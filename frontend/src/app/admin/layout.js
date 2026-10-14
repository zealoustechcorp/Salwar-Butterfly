import { AdminAuthProvider } from "@/components/admin/AdminAuthProvider";

/**
 * Every admin tab used to read "Product Management — Salwar Butterfly
 * Admin", whichever screen it held. So the title is a template: each
 * section's own layout (a server file — the pages are client components
 * and cannot export metadata) sets just its name, "Inventory", and this
 * wraps it. `absolute` keeps the storefront's "· Salwar Butterfly"
 * template in the root layout from being appended on top.
 *
 * And none of it belongs in a search index. The panel is behind a
 * sign-in, but its URLs are guessable and the login page is public, so
 * every route under /admin says noindex, nofollow.
 */
export const metadata = {
  title: {
    absolute: "Salwar Butterfly Admin",
    template: "%s — Salwar Butterfly Admin",
  },
  description: "Admin console for the Salwar Butterfly storefront.",
  robots: { index: false, follow: false },
};

/**
 * Everything under /admin — including the login page — needs the
 * auth context, so the provider lives here rather than in (panel).
 *
 * The chrome does not: /admin/login renders bare. That split is why
 * the panel routes sit inside the (panel) route group, which wraps
 * them in AdminShell without changing a single URL.
 */
export default function AdminLayout({ children }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
