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

import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Butterfly } from "./Ornaments";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

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
 * Remounted on every open, because Radix unmounts the dialog's content when it
 * closes — so a half-typed password never survives a dismissal.
 */
function AuthForm({ intent, signIn, signUp, closeAuth }) {
  const [mode, setMode] = useState(intent.mode);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [failure, setFailure] = useState(null); // { field, error }
  const [pending, setPending] = useState(false);

  const isSignUp = mode === "signup";
  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    // Clear the message the moment they start fixing the field it blamed.
    setFailure((current) => (current?.field === key ? null : current));
  };
  const errorFor = (field) => (failure?.field === field ? failure.error : null);

  const swapMode = () => {
    setMode(isSignUp ? "signin" : "signup");
    setFailure(null);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFailure(null);
    const result = isSignUp ? await signUp(values) : await signIn(values);
    // On success the provider closes this dialog, which unmounts the form —
    // so only the failure path has any state left to set.
    if (!result.ok) {
      setFailure({ field: result.field, error: result.error });
      setPending(false);
    }
  };

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
      </div>

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
