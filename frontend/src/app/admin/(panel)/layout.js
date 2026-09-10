import { AdminShell } from "@/components/admin/AdminShell";
import { RequireAdmin } from "@/components/admin/RequireAdmin";

export const metadata = {
  title: "Product Management — Salwar Butterfly Admin",
  description:
    "Product Management console for the Salwar Butterfly storefront.",
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
