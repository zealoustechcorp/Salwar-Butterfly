"use client";

/**
 * The shopper's own details (F-05.02), and changing them (F-05.06).
 *
 * Two forms rather than one, because they are two different acts with
 * two different risks. Correcting a phone number is routine and saves
 * on a button. Changing a password needs the current one, invalidates
 * nothing else, and should not be something a shopper can do by
 * tabbing through a profile form without noticing.
 *
 * Both start collapsed. The account page's job is to answer "what does
 * the shop have on file for me?", and a page that opens as an edit
 * form asks a question instead of answering one.
 *
 * Field-level errors come back from the API with the field named — a
 * duplicate email is a 409 naming `email` — so a clash lands under the
 * input that caused it rather than in a banner that does not say which
 * of three fields to fix.
 */

import { Check, KeyRound, Loader2, Pencil, UserRound, X } from "lucide-react";
import { useState } from "react";

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
import { useAuth } from "./AuthProvider";
import { useStoreToast } from "./Toast";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

function Field({ id, label, error, hint, children }) {
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

function Row({ label, value }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-sb-gold/20 py-2.5 last:border-0">
      <span className="text-xs font-semibold text-sb-text-muted">{label}</span>
      <span className="min-w-0 text-sm break-all text-sb-heading">{value || "—"}</span>
    </div>
  );
}

export function ProfileCard() {
  const { user } = useAuth();
  const toast = useStoreToast();

  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [flash, setFlash] = useState(null);

  if (!user) return null;

  return (
    <section className="mt-4 rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <UserRound className="size-5 text-sb-gold-text" aria-hidden="true" />
          <p className="sb-eyebrow mt-3 text-[10px] text-sb-gold-text">
            Your details
          </p>
          <p className="mt-1 font-display text-xl font-semibold text-sb-heading">
            What the shop has on file
          </p>
        </div>

        {!editing && !changingPassword ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setEditing(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-sb-gold/50 px-4 py-2 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setChangingPassword(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-sb-gold/50 px-4 py-2 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40"
            >
              <KeyRound className="size-3.5" aria-hidden="true" />
              Password
            </button>
          </div>
        ) : null}
      </div>

      {flash ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-sb-gold/40 bg-sb-surface/40 px-3.5 py-2.5 text-sm text-sb-heading">
          <Check className="size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
          {flash}
        </p>
      ) : null}

      {editing ? (
        <DetailsForm
          user={user}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setFlash("Your details were updated.");
            toast.success("Details updated");
          }}
        />
      ) : changingPassword ? (
        <PasswordForm
          onCancel={() => setChangingPassword(false)}
          onSaved={() => {
            setChangingPassword(false);
            setFlash("Your password was changed.");
            toast.success("Password changed", "You stay signed in on this device.");
          }}
        />
      ) : (
        <div className="mt-4">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Phone" value={user.phone} />
        </div>
      )}
    </section>
  );
}

function DetailsForm({ user, onCancel, onSaved }) {
  const { updateProfile } = useAuth();
  const toast = useStoreToast();

  const [values, setValues] = useState({
    name: user.name,
    email: user.email,
    phone: user.phone,
  });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  // Only what actually changed is sent. Re-sending an unchanged email
  // would still make the API check it for a clash against every other
  // account, and a slow duplicate check on a field nobody touched is
  // a strange way to fail.
  const changed = Object.keys(values).filter(
    (key) => values[key].trim() !== user[key],
  );

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending || changed.length === 0) return;

    setBanner(null);

    // Only what they actually touched. Validating an unchanged field would
    // block the form on a value the shop is already storing — an account
    // created before a rule tightened is not a form the shopper can fix.
    const invalid = collect(
      changed.map((key) => [
        key,
        key === "name"
          ? validateName(values.name)
          : key === "email"
            ? validateEmail(values.email)
            : validatePhone(values.phone),
      ]),
    );

    if (hasErrors(invalid)) {
      setErrors(invalid);
      toast.error("Check your details", summarizeErrors(invalid));
      return;
    }

    setPending(true);
    setErrors({});

    const result = await updateProfile(
      Object.fromEntries(changed.map((key) => [key, values[key].trim()])),
    );

    if (result.ok) {
      onSaved();
      return;
    }

    if (hasErrors(result.fields)) {
      setErrors(result.fields);
    } else if (result.field) {
      setErrors({ [result.field]: result.error });
    } else {
      setBanner(result.error);
    }

    toast.error("Could not save your details", result.error);
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 space-y-3.5">
      <Field id="profile-name" label="Your name" error={errors.name}>
        <input
          id="profile-name"
          type="text"
          value={values.name}
          onChange={set("name")}
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field id="profile-email" label="Email" error={errors.email}>
        <input
          id="profile-email"
          type="email"
          value={values.email}
          onChange={set("email")}
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field
        id="profile-phone"
        label="Phone"
        error={errors.phone}
        hint={errors.phone ? undefined : "Where the shop confirms your order on WhatsApp."}
      >
        <input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={set("phone")}
          autoComplete="tel"
          aria-invalid={Boolean(errors.phone)}
          className={FIELD_CLASS}
        />
      </Field>

      {banner ? (
        <p className="text-xs font-medium text-sb-link">{banner}</p>
      ) : null}

      <FormActions
        pending={pending}
        disabled={changed.length === 0}
        submitLabel="Save details"
        onCancel={onCancel}
      />
    </form>
  );
}

function PasswordForm({ onCancel, onSaved }) {
  const { changePassword } = useAuth();
  const toast = useStoreToast();

  const [values, setValues] = useState({ oldPassword: "", newPassword: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;

    setBanner(null);

    // The current password gets only the presence check — whether it is
    // right is the server's to answer, and the strength rules belong to the
    // one being set. The new one gets the full rule, and is refused here if
    // it matches the old: the API would accept it, and a shopper who thinks
    // they changed their password and has not is worse off than one who was
    // told no.
    const invalid = collect([
      ["oldPassword", validateLoginPassword(values.oldPassword)],
      [
        "newPassword",
        validatePassword(values.newPassword) ??
          (values.newPassword === values.oldPassword
            ? "That is your current password"
            : null),
      ],
    ]);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      toast.error("Check your passwords", summarizeErrors(invalid));
      return;
    }

    setPending(true);
    setErrors({});

    const result = await changePassword(values);

    if (result.ok) {
      onSaved();
      return;
    }

    if (hasErrors(result.fields)) {
      setErrors(result.fields);
    } else if (result.field) {
      setErrors({ [result.field]: result.error });
    } else {
      setBanner(result.error);
    }

    toast.error("Could not change your password", result.error);
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 space-y-3.5">
      <Field
        id="profile-old-password"
        label="Current password"
        error={errors.oldPassword}
      >
        <input
          id="profile-old-password"
          type="password"
          value={values.oldPassword}
          onChange={set("oldPassword")}
          autoComplete="current-password"
          aria-invalid={Boolean(errors.oldPassword)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field
        id="profile-new-password"
        label="New password"
        error={errors.newPassword}
        hint={errors.newPassword ? undefined : "At least 8 characters."}
      >
        <input
          id="profile-new-password"
          type="password"
          value={values.newPassword}
          onChange={set("newPassword")}
          autoComplete="new-password"
          aria-invalid={Boolean(errors.newPassword)}
          className={FIELD_CLASS}
        />
      </Field>

      {banner ? (
        <p className="text-xs font-medium text-sb-link">{banner}</p>
      ) : null}

      {/*
        The token is not reissued, so the shopper stays signed in here
        while any session they left open elsewhere keeps working until
        it expires. Saying so beats letting them assume otherwise.
      */}
      <p className="text-[11px] leading-relaxed text-sb-text-muted">
        You will stay signed in on this device. Anywhere else you are already
        signed in stays signed in until that session expires.
      </p>

      <FormActions
        pending={pending}
        disabled={!values.oldPassword || !values.newPassword}
        submitLabel="Change password"
        onCancel={onCancel}
      />
    </form>
  );
}

function FormActions({ pending, disabled, submitLabel, onCancel }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button
        type="submit"
        disabled={pending || disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-2.5 text-sm font-semibold text-sb-bg transition-colors",
          "hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {submitLabel}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full border border-sb-gold/50 px-5 py-2.5 text-sm font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40 disabled:opacity-50"
      >
        <X className="size-4" aria-hidden="true" />
        Cancel
      </button>
    </div>
  );
}
