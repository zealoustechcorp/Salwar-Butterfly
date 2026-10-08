"use client";

/**
 * Client-side gate for the authenticated half of /admin.
 *
 * This is a UX guard, not a security boundary. The token lives in
 * localStorage, so there is no session for the server to read during
 * SSR and nothing to gate on before the page ships. What actually
 * protects data is the backend: `authenticate` + `requireAdmin` on
 * every admin route. Bypassing this component gets you an empty
 * panel that 401s on its first request.
 *
 * It renders a skeleton rather than null while status is "loading",
 * so a signed-in admin refreshing the page sees the shape of the
 * panel instead of a blank flash.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAdminAuth } from "./AdminAuthProvider";
import { Spinner } from "./ui";

export function RequireAdmin({ children }) {
  const { isLoading, isSignedIn, outage } = useAdminAuth();

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || isSignedIn) return;

    // Carry the attempted path so login can return the admin to it.
    const next = pathname && pathname !== "/admin" ? pathname : null;

    router.replace(
      next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login",
    );
  }, [isLoading, isSignedIn, pathname, router]);

  if (isSignedIn) return children;

  return (
    <div className="admin-root flex min-h-screen items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5 text-brand-600" />

        <p className="text-sm text-ink-500">
          {isLoading
            ? "Checking your session…"
            : outage
              ? outage
              : "Redirecting to sign in…"}
        </p>
      </div>
    </div>
  );
}
