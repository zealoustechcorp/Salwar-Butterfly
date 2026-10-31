import { AdminForgotPasswordForm } from "@/components/admin/AdminPasswordReset";

export const metadata = {
  // Wrapped by the admin layout's template → "Forgot password — Salwar Butterfly Admin".
  title: "Forgot password",
  robots: { index: false, follow: false },
};

/**
 * /admin/forgot-password
 *
 * Outside the (panel) route group, like /admin/login: no AdminShell and
 * no sign-in required.
 */
export default function AdminForgotPasswordPage() {
  return <AdminForgotPasswordForm />;
}
