import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { Spinner } from "@/components/admin/ui";

export const metadata = {
  title: "Sign in — Salwar Butterfly Admin",
  description: "Sign in to the Salwar Butterfly admin console.",
  robots: { index: false, follow: false },
};

/**
 * /admin/login
 *
 * Sits outside the (panel) route group, so it renders without
 * AdminShell — no sidebar, no header, nothing that implies access.
 *
 * `.admin-root` is applied here because that class normally comes
 * from AdminShell, and without it the page would inherit the root
 * layout's dark-mode fallback.
 *
 * The Suspense boundary is required: AdminLoginForm reads `?next=`
 * with useSearchParams, which suspends during prerender.
 */
export default function AdminLoginPage() {
  return (
    <div className="admin-root min-h-screen">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <Spinner className="size-5 text-brand-600" />
          </div>
        }
      >
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
