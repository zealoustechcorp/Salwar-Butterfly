"use client";

/**
 * The admin panel's "forgot password" pair:
 *
 *   /admin/forgot-password         ask for a link by email
 *   /admin/reset-password?token=…  choose the new password
 *
 * Laid out like AdminLoginForm — the same card, no AdminShell, no
 * toasts — since all three are what an admin sees before signing in.
 *
 * The request screen says the same thing whatever address is typed. The
 * API does too, on purpose: a form that confirmed which emails belong to
 * staff would tell a phisher exactly whom to target.
 */

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, MailCheck, TriangleAlert } from "lucide-react";

import { requestPasswordReset, resetPassword } from "@/lib/admin/auth";
import { validateAdminPassword, validateEmail } from "@/lib/validate";
import { Button, Field, Input, cx } from "./ui";

// ============================================================
// SHARED CHROME
// ============================================================

function Card({ subtitle, children }) {
  return (
    <div className="admin-root min-h-dvh">
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:py-12">
        <main className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
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
            <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-ink-200 sm:p-6">
            {children}
          </div>

          <p className="mt-6 text-center text-[11px] text-ink-500">
            <Link
              href="/admin/login"
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}

function Alert({ id, children }) {
  return (
    <div
      id={id}
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-inset ring-red-200"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// ============================================================
// FORGOT PASSWORD
// ============================================================

export function AdminForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const emailId = useId();
  const formErrorId = useId();

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;

    setFormError(null);

    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setPending(true);

    try {
      const result = await requestPasswordReset(email.trim());

      if (result.ok) {
        setSent(true);
        return;
      }

      if (result.fields?.email) setError(result.fields.email);
      else setFormError(result.error);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <Card subtitle="Reset your admin password">
        <div className="text-center">
          <MailCheck className="mx-auto size-8 text-brand-600" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-ink-900">Check your email</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            If <strong className="break-all text-ink-900">{email.trim()}</strong> belongs to
            an admin account, a reset link is on its way. It works once and expires in
            15 minutes.
          </p>
          <p className="mt-3 text-xs text-ink-500">
            Nothing arrived? Check spam, or ask the shop owner to reset it for you.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card subtitle="Reset your admin password">
      <form onSubmit={handleSubmit} noValidate>
        {formError ? <Alert id={formErrorId}>{formError}</Alert> : null}

        <p className="mb-4 text-sm text-ink-600">
          Enter the email you sign in with. We will send a link to choose a new password.
        </p>

        <Field label="Email" required error={error}>
          <Input
            id={emailId}
            type="email"
            name="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            autoComplete="username"
            autoFocus
            required
            disabled={pending}
            invalid={Boolean(error)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={formError ? formErrorId : undefined}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" busy={pending} className="mt-6 w-full">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </Card>
  );
}

// ============================================================
// RESET PASSWORD
// ============================================================

export function AdminResetPasswordForm() {
  const params = useSearchParams();

  // Read once and kept in state, so the URL can be cleaned below without
  // losing it.
  const [token] = useState(() => params.get("token") ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const passwordId = useId();
  const confirmId = useId();
  const formErrorId = useId();

  // Take the token out of the address bar, so it does not stay in the
  // browser's history or get copied along with the URL.
  useEffect(() => {
    if (token && typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;

    setFormError(null);

    const next = {};
    const passwordError = validateAdminPassword(password);
    if (passwordError) next.password = passwordError;
    if (!passwordError && confirm !== password) next.confirm = "The two passwords do not match";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);

    try {
      const result = await resetPassword({ token, password });

      if (result.ok) {
        setPassword("");
        setConfirm("");
        setDone(true);
        return;
      }

      // A bad or used token is not something they can fix on this form.
      if (result.fields?.password) setErrors({ password: result.fields.password });
      else setFormError(result.fields?.token ?? result.error);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <Card subtitle="Reset your admin password">
        <h2 className="text-base font-semibold text-ink-900">This link is incomplete</h2>
        <p className="mt-2 text-sm text-ink-600">
          Open the link from your reset email again, or ask for a new one.
        </p>
        <Link
          href="/admin/forgot-password"
          className="mt-5 inline-flex text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          Ask for a new link
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card subtitle="Reset your admin password">
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-8 text-brand-600" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-ink-900">Password changed</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            You have been signed out of the admin panel on every device. Sign in
            with your new password to carry on.
          </p>
          <Link
            href="/admin/login"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Sign in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card subtitle="Choose a new admin password">
      <form onSubmit={handleSubmit} noValidate>
        {formError ? (
          <Alert id={formErrorId}>
            {formError}{" "}
            <Link href="/admin/forgot-password" className="font-semibold underline underline-offset-2">
              Ask for a new link
            </Link>
          </Alert>
        ) : null}

        <p className="mb-4 text-xs text-ink-500">
          At least 10 characters, with an uppercase letter, a lowercase letter
          and a number.
        </p>

        <div className="space-y-4">
          <Field label="New password" required error={errors.password}>
            <div className="relative">
              <Input
                id={passwordId}
                type={revealed ? "text" : "password"}
                name="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors(({ password: _dropped, ...rest }) => rest);
                }}
                autoComplete="new-password"
                autoFocus
                required
                disabled={pending}
                className="pr-10"
                invalid={Boolean(errors.password)}
                aria-invalid={Boolean(errors.password) || undefined}
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

          <Field label="Type it again" required error={errors.confirm}>
            <Input
              id={confirmId}
              type={revealed ? "text" : "password"}
              name="confirm-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setErrors(({ confirm: _dropped, ...rest }) => rest);
              }}
              autoComplete="new-password"
              required
              disabled={pending}
              invalid={Boolean(errors.confirm)}
              aria-invalid={Boolean(errors.confirm) || undefined}
            />
          </Field>
        </div>

        <Button type="submit" variant="primary" size="lg" busy={pending} className="mt-6 w-full">
          {pending ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
