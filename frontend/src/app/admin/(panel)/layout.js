import { AdminShell } from "@/components/admin/AdminShell";
import { RequireAdmin } from "@/components/admin/RequireAdmin";

/**
 * The dashboard's title, and the fallback for any screen without a
 * section layout of its own. Each section (products, inventory, …) sets
 * its name in its own layout; the admin layout's template wraps it.
 */
export const metadata = {
  title: "Dashboard",
};

/**
 * The authenticated half of /admin.
 *
 * RequireAdmin sits outside AdminShell so a signed-out visitor never
 * sees the chrome flash before being redirected to /admin/login.
 */
export default function PanelLayout({ children }) {
  return (
    <RequireAdmin>
      <AdminShell>{children}</AdminShell>
    </RequireAdmin>
  );
}
