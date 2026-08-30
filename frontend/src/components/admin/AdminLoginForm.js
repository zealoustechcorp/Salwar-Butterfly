"use client";

/**
 * Admin sign-in form.
 *
 * Follows the storefront AuthModal's conventions — controlled inputs,
 * a `pending` flag, a single `failure` object, aria-invalid wired to
 * aria-describedby — but talks to the real API instead of a
 * localStorage shim.
 *
 * The server answers a wrong email and a wrong password with the same
 * message on purpose, so this form never tells a visitor which half
 * they got right.
 */

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";

import { useAdminAuth } from "./AdminAuthProvider";
import { Button, Field, Input, Spinner, cx } from "./ui";

const DEFAULT_DESTINATION = "/admin/products";

/**
 * Only ever redirect inside this app. A `?next=` of
 * `https://example.com` would otherwise turn the login page into an
 * open redirect — handy for phishing, since the link genuinely starts
 * on the real admin domain.
 */
function safeDestination(next) {
  if (typeof next !== "string" || !next) return DEFAULT_DESTINATION;

  // Must be a single-slash absolute path. Rejects "//evil.com"
  // (protocol-relative) and anything with a scheme.
  if (!next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_DESTINATION;
  }

  return next;
}

export function AdminLoginForm() {
  const { signIn, isSignedIn, isLoading } = useAdminAuth();

  const router = useRouter();
  const searchParams = useSearchParams();

  const destination = safeDestination(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);

  /** `{ field, error }` — field is null for form-level failures. */
  const [failure, setFailure] = useState(null);

  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();

  // --------------------------------------------------------
  // ALREADY SIGNED IN
  // --------------------------------------------------------
  //
  // Covers both arriving at /admin/login with a live session and the
  // moment just after a successful submit.
  //
  // --------------------------------------------------------

  useEffect(() => {
    if (isSignedIn) router.replace(destination);
  }, [isSignedIn, destination, router]);

  // --------------------------------------------------------
  // SUBMIT
  // --------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    if (pending) return;

    setPending(true);
    setFailure(null);

    try {
      const result = await signIn(email, password);

      if (result.ok) {
        // Clear the password from memory the moment it is spent.
        setPassword("");
        router.replace(destination);
        return;
      }

      // Field-level errors come back from the validator as
      // { email: "...", password: "..." }; credential failures come
      // back as a message with no field attached.
      const fieldName = Object.keys(result.fields ?? {})[0] ?? null;

      setFailure({
        field: fieldName,
        error: fieldName ? result.fields[fieldName] : result.error,
      });
    } catch {
      setFailure({
        field: null,
        error: "Something went wrong. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }

  const formError = failure && !failure.field ? failure.error : null;

  // A live session is being resolved — do not flash a login form at
  // an admin who is about to be redirected away from it.
  if (isLoading || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-5 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <main className="w-full max-w-sm">
        {/* ---------------------------------------------- */}
        {/* BRAND                                          */}
        {/* ---------------------------------------------- */}

        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/Salwar Butterfly.jpeg"
            alt=""
            width={64}
            height={64}
            priority
            className="rounded-xl ring-1 ring-brand-200"
          />

          <h1 className="mt-4 font-display text-2xl font-semibold text-ink-900">
            Salwar Butterfly
          </h1>

          <p className="mt-1 text-sm text-ink-500">
            Sign in to the admin console
          </p>
        </div>

        {/* ---------------------------------------------- */}
        {/* FORM                                           */}
        {/* ---------------------------------------------- */}

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-ink-200"
        >
          {formError ? (
            <div
              id={formErrorId}
              role="alert"
              className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-inset ring-red-200"
            >
              <TriangleAlert
                className="mt-px size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="space-y-4">
            <Field
              label="Email"
              required
              error={failure?.field === "email" ? failure.error : undefined}
            >
              <Input
                id={emailId}
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoFocus
                required
                disabled={pending}
                placeholder="you@salwarbutterfly.com"
                invalid={failure?.field === "email" || Boolean(formError)}
                aria-invalid={
                  failure?.field === "email" || Boolean(formError) || undefined
                }
                aria-describedby={formError ? formErrorId : undefined}
              />
            </Field>

            <Field
              label="Password"
              required
              error={failure?.field === "password" ? failure.error : undefined}
            >
              <div className="relative">
                <Input
                  id={passwordId}
                  type={revealed ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={pending}
                  className="pr-10"
                  invalid={failure?.field === "password" || Boolean(formError)}
                  aria-invalid={
                    failure?.field === "password" ||
                    Boolean(formError) ||
                    undefined
                  }
                  aria-describedby={formError ? formErrorId : undefined}
                />

                <button
                  type="button"
                  onClick={() => setRevealed((value) => !value)}
                  disabled={pending}
                  aria-label={revealed ? "Hide password" : "Show password"}
                  aria-pressed={revealed}
                  className={cx(
                    "absolute inset-y-0 right-0 flex w-10 items-center justify-center",
                    "rounded-r-lg text-ink-400 transition-colors hover:text-ink-600",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600",
                    "disabled:cursor-not-allowed",
                  )}
                >
                  {revealed ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            busy={pending}
            className="mt-6 w-full"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/* ---------------------------------------------- */}
        {/* FOOTER                                         */}
        {/* ---------------------------------------------- */}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-500">
          <Lock className="size-3" aria-hidden="true" />
          Staff access only.{" "}
          <Link
            href="/"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Back to store
          </Link>
        </p>
      </main>
    </div>
  );
}
