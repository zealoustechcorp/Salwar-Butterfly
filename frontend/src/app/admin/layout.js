import { AdminAuthProvider } from "@/components/admin/AdminAuthProvider";

export const metadata = {
  title: "Salwar Butterfly Admin",
  description: "Admin console for the Salwar Butterfly storefront.",
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
