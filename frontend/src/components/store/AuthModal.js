"use client";

/**
 * The one sign-in dialog, rendered once by <AuthProvider> and opened from
 * anywhere with `openAuth()`.
 *
 * It is a Radix dialog rather than a hand-rolled overlay because this one earns
 * the focus trap: the shopper is interrupted mid-task, and when they finish or
 * dismiss it, focus has to land back on the control that opened it. Radix also
 * closes on Escape and on an outside click, and marks the page behind inert for
 * a screen reader, none of which the header's drawer needs to get right.
 */

import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, MailCheck, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { requestPasswordReset } from "@/lib/store/auth";
import {
  collect,
  hasErrors,
  summarizeErrors,
  validateEmail,
  validateLoginPassword,
  validateName,
  validatePassword,
  validatePhone,
} from "@/lib/validate";
import { cn } from "@/lib/utils";
import { Butterfly } from "./Ornaments";
import { useStoreToast } from "./Toast";

// 16px below `sm`: iOS Safari zooms the page in on focus for anything smaller.
const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-base text-sb-text sm:text-sm placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

function Field({ id, label, error, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-sb-text">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-sb-link">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-sb-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Every field this form will accept, checked before anything is sent.
 *
 * Signing in checks less than signing up, and that is a security decision
 * rather than a shortcut. The 8-character rule belongs to a password being
 * *set*; applying it to one being *checked* would refuse an account whose
 * password predates the rule, and would tell whoever is guessing which
 * candidates are worth submitting at all.
 */
function validateAuth(values, isSignUp) {
  if (!isSignUp) {
    return collect([
      ["email", validateEmail(values.email)],
      ["password", validateLoginPassword(values.password)],
    ]);
  }

  return collect([
    ["name", validateName(values.name)],
    ["email", validateEmail(values.email)],
    ["phone", validatePhone(values.phone)],
    ["password", validatePassword(values.password)],
  ]);
}

/**
 * Remounted on every open, because Radix unmounts the dialog's content when it
 * closes — so a half-typed password never survives a dismissal.
 */
function AuthForm({ intent, signIn, signUp, closeAuth }) {
  const toast = useStoreToast();

  const [mode, setMode] = useState(intent.mode);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  /**
   * `{ field: message }`, filled either by the checks above or by the API.
   * One shape for both, so a message lands under its input whether it was
   * caught here or refused there.
   */
  const [errors, setErrors] = useState({});

  /** A refusal that named no field — a wrong password, or the API being down. */
  const [banner, setBanner] = useState(null);

  const [pending, setPending] = useState(false);

  const isSignUp = mode === "signup";
  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));

    // Clear the message the moment they start fixing the field it blamed.
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const errorFor = (field) => errors[field] ?? null;

  const swapMode = () => {
    setMode(isSignUp ? "signin" : "signup");
    setErrors({});
    setBanner(null);
  };

  const showForgot = () => {
    setMode("forgot");
    setErrors({});
    setBanner(null);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    setBanner(null);

    // Caught here, every bad field is named at once. Left to the API, the
    // first one it happens to check is the only one reported, and a shopper
    // fixes four mistakes over four round trips.
    const invalid = validateAuth(values, isSignUp);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      toast.error(
        isSignUp ? "Check your details" : "Check your sign-in details",
        summarizeErrors(invalid),
      );
      return;
    }

    setPending(true);
    setErrors({});

    const result = isSignUp ? await signUp(values) : await signIn(values);

    // On success the provider closes this dialog, which unmounts the form —
    // so only the failure path has any state left to set.
    if (!result.ok) {
      // The API names the field it refused where it can: a duplicate email
      // is a 409 naming `email`. Where it cannot — a wrong password reads
      // the same as an unknown address, deliberately — the message goes to
      // the banner instead of being pinned on a guess.
      if (Object.keys(result.fields ?? {}).length > 0) {
        setErrors(result.fields);
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        setBanner(result.error);
      }

      toast.error(
        isSignUp ? "Could not create your account" : "Could not sign you in",
        result.error,
      );
      setPending(false);
    }
  };

  // After every hook above, so switching modes never changes hook order.
  // The email typed so far carries over — they were just typing it.
  if (mode === "forgot") {
    return (
      <ForgotPasswordForm
        initialEmail={values.email}
        onBack={() => setMode("signin")}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Butterfly className="size-7 text-sb-gold-text" strokeWidth={1.2} />

      <DialogPrimitive.Title className="mt-3 font-display text-2xl font-semibold text-sb-heading">
        {isSignUp ? "Create your account" : "Sign in"}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-1.5 text-sm text-sb-text-muted">
        {intent.reason ??
          (isSignUp
            ? "Keep your wishlist with you instead of on one device."
            : "Your account keeps your wishlist wherever you shop from.")}
      </DialogPrimitive.Description>

      <div className="mt-5 space-y-3.5">
        {isSignUp ? (
          <Field id="auth-name" label="Your name" error={errorFor("name")}>
            <input
              id="auth-name"
              type="text"
              value={values.name}
              onChange={set("name")}
              autoComplete="name"
              autoFocus
              placeholder="Meera"
              aria-invalid={Boolean(errorFor("name"))}
              aria-describedby={errorFor("name") ? "auth-name-error" : undefined}
              className={FIELD_CLASS}
            />
          </Field>
        ) : null}

        <Field id="auth-email" label="Email" error={errorFor("email")}>
          <input
            id="auth-email"
            type="email"
            value={values.email}
            onChange={set("email")}
            autoComplete="email"
            autoFocus={!isSignUp}
            placeholder="you@example.com"
            aria-invalid={Boolean(errorFor("email"))}
            aria-describedby={errorFor("email") ? "auth-email-error" : undefined}
            className={FIELD_CLASS}
          />
        </Field>

        {/*
          Required, not optional. The shop confirms orders on WhatsApp,
          so a number is how a customer actually gets told their parcel
          has gone out — and the API stores it NOT NULL for that reason.
        */}
        {isSignUp ? (
          <Field
            id="auth-phone"
            label="Phone"
            error={errorFor("phone")}
            hint={errorFor("phone") ? undefined : "Where the shop confirms your order on WhatsApp."}
          >
            <input
              id="auth-phone"
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={set("phone")}
              autoComplete="tel"
              placeholder="9876543210"
              aria-invalid={Boolean(errorFor("phone"))}
              aria-describedby={errorFor("phone") ? "auth-phone-error" : undefined}
              className={FIELD_CLASS}
            />
          </Field>
        ) : null}

        <PasswordField
          value={values.password}
          onChange={set("password")}
          isSignUp={isSignUp}
          error={errorFor("password")}
        />

        {isSignUp ? null : (
          <div className="-mt-1 text-right">
            <button
              type="button"
              onClick={showForgot}
              className="text-xs font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
            >
              Forgot password?
            </button>
          </div>
        )}
      </div>

      {/* A refusal with no field to sit under. The toast that went up with
          it is gone in six seconds; this stays until they try again. */}
      {banner ? (
        <p
          role="alert"
          className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-3.5 py-2.5 text-xs leading-relaxed font-medium text-sb-link"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {banner}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="mt-4 text-center text-sm text-sb-text-muted">
        {isSignUp ? "Already have an account?" : "New to Salwar Butterfly?"}{" "}
        <button
          type="button"
          onClick={swapMode}
          className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </p>

      <p className="mt-4 border-t border-sb-gold/25 pt-3.5 text-center text-[11px] leading-relaxed text-sb-text-muted">
        You do not need an account to shop — the bag and checkout are open to
        everyone.{" "}
        <button
          type="button"
          onClick={closeAuth}
          className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
        >
          Keep browsing
        </button>
      </p>
    </form>
  );
}

/**
 * "Forgot password": asks for the email and sends a reset link.
 *
 * The confirmation reads the same whether or not the address has an
 * account — the API answers identically, and so must this screen, or it
 * becomes a way to check who shops here.
 */
function ForgotPasswordForm({ initialEmail, onBack }) {
  const toast = useStoreToast();

  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    const invalid = validateEmail(email);

    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    setError(null);

    const result = await requestPasswordReset({ email: email.trim() });

    setPending(false);

    if (result.ok) {
      setSentTo(email.trim());
      return;
    }

    if (result.field === "email") {
      setError(result.error);
    }

    toast.error("Could not send the reset link", result.error);
  };

  if (sentTo) {
    return (
      <div>
        <MailCheck className="size-7 text-sb-gold-text" strokeWidth={1.4} aria-hidden="true" />

        <DialogPrimitive.Title className="mt-3 font-display text-2xl font-semibold text-sb-heading">
          Check your email
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-sb-text-muted">
          If an account exists for <strong className="text-sb-text">{sentTo}</strong>,
          we have sent a link to reset your password. It works once and expires
          in 30 minutes.
        </DialogPrimitive.Description>

        <p className="mt-4 text-xs leading-relaxed text-sb-text-muted">
          Nothing arrived after a few minutes? Check your spam folder, or make
          sure this is the email you signed up with.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Butterfly className="size-7 text-sb-gold-text" strokeWidth={1.2} />

      <DialogPrimitive.Title className="mt-3 font-display text-2xl font-semibold text-sb-heading">
        Forgot your password?
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="mt-1.5 text-sm text-sb-text-muted">
        Enter the email you signed up with and we will send you a link to
        choose a new one.
      </DialogPrimitive.Description>

      <div className="mt-5">
        <Field id="forgot-email" label="Email" error={error}>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "forgot-email-error" : undefined}
            className={FIELD_CLASS}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Send reset link
      </button>

      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to sign in
      </button>
    </form>
  );
}

function PasswordField({ value, onChange, isSignUp, error }) {
  const [shown, setShown] = useState(false);

  return (
    <Field
      id="auth-password"
      label="Password"
      error={error}
      hint={isSignUp ? "At least 8 characters." : null}
    >
      <div className="relative">
        <input
          id="auth-password"
          type={shown ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder="••••••"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "auth-password-error" : undefined}
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
    </Field>
  );
}

/**
 * Everything it needs arrives as props rather than through `useAuth()`, even
 * though it renders inside the provider: <AuthProvider> imports this file, so
 * reaching back for the context would close an import cycle for no gain.
 */
export function AuthModal({ intent, signIn, signUp, closeAuth }) {
  return (
    <DialogPrimitive.Root
      open={Boolean(intent)}
      onOpenChange={(open) => {
        if (!open) closeAuth();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-sb-footer/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="sb-enter fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-sb-gold/40 bg-sb-bg p-6 font-body shadow-2xl shadow-sb-footer/25 sm:p-7">
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3.5 right-3.5 rounded-full p-2 text-sb-text-muted transition-colors hover:bg-sb-surface/70 hover:text-sb-heading"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>

          {intent ? (
            <AuthForm
              intent={intent}
              signIn={signIn}
              signUp={signUp}
              closeAuth={closeAuth}
            />
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
