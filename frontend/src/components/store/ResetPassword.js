"use client";

/**
 * The page a password reset email links to: /reset-password?token=…
 *
 * The token is read from the URL and sent back once, with the new
 * password. On success the API has ended every session on the account,
 * so the shopper is pointed at the sign-in dialog rather than assumed to
 * be signed in.
 */

import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { resetPassword } from "@/lib/store/auth";
import { validatePassword } from "@/lib/validate";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthProvider";
import { useStoreToast } from "./Toast";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-base text-sb-text sm:text-sm placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

export function ResetPassword() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const { openAuth } = useAuth();
  const toast = useStoreToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    const next = {};
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    if (!passwordError && confirm !== password) next.confirm = "The two passwords do not match";

    setErrors(next);
    setBanner(null);
    if (Object.keys(next).length > 0) return;

    setPending(true);

    const result = await resetPassword({ token, password });

    setPending(false);

    if (result.ok) {
      setDone(true);
      toast.success("Password changed", "Sign in with your new password.");
      return;
    }

    // A bad or used token is not something they can fix on this form.
    if (result.fields?.password) {
      setErrors({ password: result.fields.password });
    } else {
      setBanner(result.fields?.token ?? result.error);
    }
  };

  const shell = (children) => (
    <section className="mx-auto max-w-md px-4 py-9 sm:px-6 sm:py-13">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Your account</p>
      {children}
    </section>
  );

  if (!token) {
    return shell(
      <>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading">
          This link is incomplete
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-sb-text-muted">
          Open the link from your reset email again, or ask for a new one from
          the sign-in screen.
        </p>
        <button
          type="button"
          onClick={() => openAuth()}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
        >
          Go to sign in
        </button>
      </>,
    );
  }

  if (done) {
    return shell(
      <>
        <CheckCircle2 className="mt-3 size-8 text-sb-gold-text" strokeWidth={1.4} aria-hidden="true" />
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading">
          Password changed
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-sb-text-muted">
          You have been signed out everywhere for safety. Sign in with your new
          password to carry on.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => openAuth()}
            className="inline-flex items-center justify-center rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Sign in
          </button>
          <Link
            href="/"
            className="text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
          >
            Back to the shop
          </Link>
        </div>
      </>,
    );
  }

  return shell(
    <>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading">
        Choose a new password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-sb-text-muted">
        At least 8 characters. You will be signed out of every device once it
        is changed.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6">
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-xs font-semibold text-sb-text">
              New password
            </label>
            <div className="relative mt-1.5">
              <input
                id="reset-password"
                type={shown ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: undefined }));
                }}
                autoComplete="new-password"
                autoFocus
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "reset-password-error" : undefined}
                className={cn(FIELD_CLASS, "pr-11")}
              />
              <button
                type="button"
                onClick={() => setShown((current) => !current)}
                aria-label={shown ? "Hide password" : "Show password"}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-lg p-2 text-sb-text-muted transition-colors hover:text-sb-heading"
              >
                {shown ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password ? (
              <p id="reset-password-error" className="mt-1.5 text-xs font-medium text-sb-link">
                {errors.password}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block text-xs font-semibold text-sb-text">
              Type it again
            </label>
            <input
              id="reset-confirm"
              type={shown ? "text" : "password"}
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setErrors((current) => ({ ...current, confirm: undefined }));
              }}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? "reset-confirm-error" : undefined}
              className={cn(FIELD_CLASS, "mt-1.5")}
            />
            {errors.confirm ? (
              <p id="reset-confirm-error" className="mt-1.5 text-xs font-medium text-sb-link">
                {errors.confirm}
              </p>
            ) : null}
          </div>
        </fieldset>

        {banner ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-sb-link/40 bg-sb-link/5 px-4 py-3 text-sm font-medium text-sb-link"
          >
            <p className="flex gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {banner}
            </p>
            <button
              type="button"
              onClick={() => openAuth()}
              className="mt-2 ml-6 text-xs font-semibold underline underline-offset-4 hover:text-sb-heading"
            >
              Ask for a new link
            </button>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Change password
        </button>
      </form>
    </>,
  );
}
