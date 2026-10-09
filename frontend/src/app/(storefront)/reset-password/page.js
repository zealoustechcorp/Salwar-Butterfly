import { Suspense } from "react";

import { ResetPassword } from "@/components/store/ResetPassword";

export const metadata = {
  title: "Reset your password",
  description: "Choose a new password for your Salwar Butterfly account.",
  // A page reached only from an email link has no business in search.
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary to build statically.
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  );
}
