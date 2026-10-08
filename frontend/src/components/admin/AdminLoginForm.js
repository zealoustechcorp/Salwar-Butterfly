"use client";

/**
 * Admin sign-in form.
 *
 * Follows the storefront AuthModal's conventions — controlled inputs,
 * a `pending` flag, a `{ field: message }` error map, aria-invalid wired
 * to aria-describedby — but talks to the real API instead of a
 * localStorage shim.
 *
 * The server answers a wrong email and a wrong password with the same
 * message on purpose, so this form never tells a visitor which half
 * they got right. The checks run before submitting keep to that rule:
 * a malformed email and a missing password are refused for being
 * malformed and missing, which says nothing about whether an account
 * with that address exists.
 *
 * Nothing here toasts. The admin ToastProvider lives inside AdminShell,
 * which this page deliberately renders without — and a sign-in form has
 * one thing to say and one place to say it, directly above the fields.
 */

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Clock, Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";

import {
  collect,
  hasErrors,
  validateEmail,
  validateLoginPassword,
} from "@/lib/validate";
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
  const { signIn, isSignedIn, isLoading, expiry } = useAdminAuth();

  const router = useRouter();
  const searchParams = useSearchParams();

  const destination = safeDestination(searchParams.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);

  /** `{ field: message }` — what belongs under an input. */
  const [errors, setErrors] = useState({});

  /** A refusal with no field at fault — bad credentials, or a dead API. */
  const [formError, setFormError] = useState(null);

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

    setFormError(null);

    // Caught here so a typo in the address is answered under the address
    // rather than as the same "check your details" a wrong password gets —
    // the one case where telling the two apart gives nothing away.
    const invalid = collect([
      ["email", validateEmail(email)],
      ["password", validateLoginPassword(password)],
    ]);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      return;
    }

    setPending(true);
    setErrors({});

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
      if (hasErrors(result.fields)) setErrors(result.fields);
      else setFormError(result.error);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // An admin who was working a second ago and is now looking at a login
  // page deserves a reason. It gives way to a real failure the moment
  // they submit — two notices stacked above one form is one too many.
  const expiryNotice = !formError ? expiry : null;

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
          {expiryNotice ? (
            <div
              role="status"
              className="mb-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200"
            >
              <Clock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{expiryNotice}</span>
            </div>
          ) : null}

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
            <Field label="Email" required error={errors.email}>
              <Input
                id={emailId}
                type="email"
                name="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  // Clear the message the moment they start fixing it.
                  setErrors(({ email: _dropped, ...rest }) => rest);
                }}
                autoComplete="username"
                autoFocus
                required
                disabled={pending}
                placeholder="you@salwarbutterfly.com"
                invalid={Boolean(errors.email || formError)}
                aria-invalid={Boolean(errors.email || formError) || undefined}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </Field>

            <Field label="Password" required error={errors.password}>
              <div className="relative">
                <Input
                  id={passwordId}
                  type={revealed ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors(({ password: _dropped, ...rest }) => rest);
                  }}
                  autoComplete="current-password"
                  required
                  disabled={pending}
                  className="pr-10"
                  invalid={Boolean(errors.password || formError)}
                  aria-invalid={Boolean(errors.password || formError) || undefined}
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
