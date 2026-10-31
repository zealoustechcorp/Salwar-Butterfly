import { Suspense } from "react";

import { AdminResetPasswordForm } from "@/components/admin/AdminPasswordReset";

export const metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
  // The token is in this page's URL. No Referer, so it is never handed
  // to anything the page loads or links to.
  referrer: "no-referrer",
};

/**
 * /admin/reset-password?token=…
 *
 * The page the admin reset email links to. The Suspense boundary is
 * required: the form reads `?token=` with useSearchParams.
 */
export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <AdminResetPasswordForm />
    </Suspense>
  );
}
