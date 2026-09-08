"use client";

/**
 * The shopper's saved delivery addresses (F-05.03, F-08.05).
 *
 * Sits under <ProfileCard> on `/account` and follows its shape: a card that
 * answers "what does the shop have on file for me?" before it offers to change
 * anything, with the forms collapsed until asked for.
 *
 * The cap is three, and it is shown before it is hit. A disabled "Add" with the
 * reason next to it is a shopper who knows to delete one; an enabled button
 * that returns a 409 is a shopper who thinks the shop is broken. The API
 * enforces it regardless — this is the courtesy, not the rule.
 *
 * The fields here are not shared with checkout, and that is a decision rather
 * than an oversight. Checkout's address form sits inside a wider payload, has
 * its own placeholders and a state dropdown, and is the form a guest fills in
 * — factoring the two together would mean a component whose props existed only
 * to say which of the two it was being. What *is* shared is the validation, in
 * backend/src/validators/address.rules.js, which is the part that would
 * actually break if the two drifted.
 *
 * `formatAddress` is exported because checkout's picker renders saved
 * addresses the same way this list does.
 */

import { Check, Home, Loader2, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  MAX_ADDRESSES,
  createAddress,
  deleteAddress,
  fetchAddresses,
  setDefaultAddress,
  updateAddress,
} from "@/lib/store/addresses";
import { cn } from "@/lib/utils";
import { useAuth } from "./AuthProvider";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

const EMPTY = {
  label: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Tamil Nadu",
  postalCode: "",
  country: "India",
};

/**
 * One address as a single line — what a picker shows.
 *
 * The optional parts are dropped rather than rendered as gaps, so an address
 * with no landmark does not read as an address with something missing.
 */
export function formatAddress(address) {
  return [
    address.line1,
    address.line2,
    address.landmark,
    address.city,
    address.state,
    address.postalCode,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

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

/**
 * The seven address fields, plus the optional label.
 *
 * `errors` are keyed the way the API returns them — bare field names, since
 * this form posts an address and nothing else.
 */
function AddressFields({ idPrefix, values, errors, onChange, disabled }) {
  const set = (key) => (event) => onChange(key, event.target.value);

  const id = (key) => `${idPrefix}-${key}`;

  return (
    <fieldset disabled={disabled} className="space-y-3.5 disabled:opacity-60">
      <Field
        id={id("label")}
        label="Name this address (optional)"
        error={errors.label}
        hint={errors.label ? undefined : "Home, Office — so you can tell them apart."}
      >
        <input
          id={id("label")}
          type="text"
          value={values.label}
          onChange={set("label")}
          maxLength={40}
          aria-invalid={Boolean(errors.label)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field id={id("line1")} label="Door number and street" error={errors.line1}>
        <input
          id={id("line1")}
          type="text"
          value={values.line1}
          onChange={set("line1")}
          autoComplete="address-line1"
          aria-invalid={Boolean(errors.line1)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field id={id("line2")} label="Area (optional)" error={errors.line2}>
        <input
          id={id("line2")}
          type="text"
          value={values.line2}
          onChange={set("line2")}
          autoComplete="address-line2"
          aria-invalid={Boolean(errors.line2)}
          className={FIELD_CLASS}
        />
      </Field>

      <Field
        id={id("landmark")}
        label="Landmark (optional)"
        error={errors.landmark}
        hint={errors.landmark ? undefined : "What the courier will ask for on the phone."}
      >
        <input
          id={id("landmark")}
          type="text"
          value={values.landmark}
          onChange={set("landmark")}
          aria-invalid={Boolean(errors.landmark)}
          className={FIELD_CLASS}
        />
      </Field>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field id={id("city")} label="City" error={errors.city}>
          <input
            id={id("city")}
            type="text"
            value={values.city}
            onChange={set("city")}
            autoComplete="address-level2"
            aria-invalid={Boolean(errors.city)}
            className={FIELD_CLASS}
          />
        </Field>

        <Field id={id("state")} label="State" error={errors.state}>
          <input
            id={id("state")}
            type="text"
            value={values.state}
            onChange={set("state")}
            autoComplete="address-level1"
            aria-invalid={Boolean(errors.state)}
            className={FIELD_CLASS}
          />
        </Field>
      </div>

      <Field
        id={id("postalCode")}
        label="PIN code"
        error={errors.postalCode}
        hint={errors.postalCode ? undefined : "Six digits. The shop ships within India only."}
      >
        <input
          id={id("postalCode")}
          type="text"
          inputMode="numeric"
          value={values.postalCode}
          onChange={set("postalCode")}
          autoComplete="postal-code"
          maxLength={6}
          aria-invalid={Boolean(errors.postalCode)}
          className={cn(FIELD_CLASS, "sm:max-w-48")}
        />
      </Field>
    </fieldset>
  );
}

/** The fields, wrapped in a form that saves them to the address book. */
function AddressForm({ address, canDefault, onCancel, onSaved }) {
  const { token } = useAuth();

  const [values, setValues] = useState(() => ({
    ...EMPTY,
    ...Object.fromEntries(
      Object.keys(EMPTY).map((key) => [key, address?.[key] ?? EMPTY[key]]),
    ),
  }));
  const [makeDefault, setMakeDefault] = useState(address?.isDefault ?? false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [pending, setPending] = useState(false);

  const onChange = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
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

    setPending(true);
    setErrors({});
    setBanner(null);

    const payload = { ...values, isDefault: makeDefault };

    const result = address
      ? await updateAddress(address.id, payload, token)
      : await createAddress(payload, token);

    if (result.ok) {
      onSaved(result.address);
      return;
    }

    // The API names the field it refused, the same way the profile form's
    // duplicate-email check does, so the message lands under the input.
    if (Object.keys(result.fields ?? {}).length > 0) {
      setErrors(result.fields);
    } else {
      setBanner(result.error);
    }

    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 space-y-3.5">
      <AddressFields
        idPrefix={address ? `address-${address.id}` : "address-new"}
        values={values}
        errors={errors}
        onChange={onChange}
        disabled={pending}
      />

      {/*
        Hidden when this address is already the default, since unticking it
        would leave the account with none and there is nothing useful for
        the box to do. Making another one the default is how you move it.
      */}
      {canDefault && !address?.isDefault ? (
        <label className="flex items-start gap-2.5 text-sm text-sb-text">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(event) => setMakeDefault(event.target.checked)}
            disabled={pending}
            className="mt-0.5 size-4 rounded border-sb-gold/50 accent-sb-btn-primary"
          />
          Use this as my default delivery address
        </label>
      ) : null}

      {banner ? <p className="text-xs font-medium text-sb-link">{banner}</p> : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-6 py-2.5 text-sm font-semibold text-sb-bg transition-colors",
            "hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {address ? "Save changes" : "Save address"}
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
    </form>
  );
}

function SavedAddress({ address, busy, onEdit, onMakeDefault, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="border-b border-sb-gold/20 py-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-sb-heading">
            <Home className="size-3.5 shrink-0 text-sb-gold-text" aria-hidden="true" />
            {address.label || "Delivery address"}
            {address.isDefault ? (
              <span className="rounded-full bg-sb-surface-pink px-2 py-0.5 text-[10px] font-semibold text-sb-ink-on-pink">
                Default
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-sb-text">
            {formatAddress(address)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!address.isDefault ? (
            <button
              type="button"
              onClick={onMakeDefault}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-sb-gold/50 px-3.5 py-1.5 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40 disabled:opacity-50"
            >
              <Star className="size-3.5" aria-hidden="true" />
              Make default
            </button>
          ) : null}

          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-sb-gold/50 px-3.5 py-1.5 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40 disabled:opacity-50"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </button>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-sb-gold/50 px-3.5 py-1.5 text-xs font-semibold text-sb-link transition-colors hover:border-sb-link hover:bg-sb-surface/40 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      </div>

      {/*
        Confirmed inline rather than in a dialog. There is nothing to read
        that is not already on the screen, and the address it is about stays
        visible above the two buttons.
      */}
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sb-gold/40 bg-sb-surface/30 px-3.5 py-2.5">
          <span className="text-xs text-sb-text">Remove this address?</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
            disabled={busy}
            className="rounded-full bg-sb-btn-primary px-4 py-1.5 text-xs font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-sb-gold/50 px-4 py-1.5 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading"
          >
            Keep it
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function AddressBook() {
  const { token, isSignedIn } = useAuth();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetchAddresses(token, { signal: controller.signal })
      .then((result) => {
        if (result.ok) {
          setAddresses(result.addresses);
          setError(null);
        } else {
          setError(result.error);
        }
      })
      .catch((cause) => {
        if (cause?.name !== "AbortError") setError("Could not load your addresses.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token]);

  // Every write returns the address or the list, so the card re-renders from
  // what the API just said rather than from a guess about what it did.
  const refresh = useCallback(async () => {
    const result = await fetchAddresses(token);
    if (result.ok) setAddresses(result.addresses);
  }, [token]);

  const run = async (action, message) => {
    setBusy(true);
    setFlash(null);
    setError(null);

    const result = await action();

    if (result.ok) {
      if (result.addresses) setAddresses(result.addresses);
      else await refresh();
      setFlash(message);
    } else {
      setError(result.error);
    }

    setBusy(false);
  };

  if (!isSignedIn) return null;

  const full = addresses.length >= MAX_ADDRESSES;
  const editing = addresses.find((address) => address.id === editingId) ?? null;

  return (
    <section id="addresses" className="mt-4 rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <MapPin className="size-5 text-sb-gold-text" aria-hidden="true" />
          <p className="sb-eyebrow mt-3 text-[10px] text-sb-gold-text">Your addresses</p>
          <p className="mt-1 font-display text-xl font-semibold text-sb-heading">
            Where your parcels go
          </p>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-sb-text-muted">
            Save up to {MAX_ADDRESSES} addresses and pick one at checkout instead of
            typing it again. Orders already placed keep the address they were sent
            to, so editing one here never changes an old order.
          </p>
        </div>

        {!adding && !editing ? (
          <button
            type="button"
            onClick={() => {
              setFlash(null);
              setError(null);
              setAdding(true);
            }}
            disabled={full || loading}
            title={full ? `You already have ${MAX_ADDRESSES} saved.` : undefined}
            className="inline-flex items-center gap-2 rounded-full border border-sb-gold/50 px-4 py-2 text-xs font-semibold text-sb-heading transition-colors hover:border-sb-heading hover:bg-sb-surface/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add an address
          </button>
        ) : null}
      </div>

      {flash ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-sb-gold/40 bg-sb-surface/40 px-3.5 py-2.5 text-sm text-sb-heading">
          <Check className="size-4 shrink-0 text-sb-gold-text" aria-hidden="true" />
          {flash}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm font-medium text-sb-link">{error}</p> : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-sb-text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your addresses…
        </p>
      ) : editing ? (
        <AddressForm
          address={editing}
          canDefault={addresses.length > 1}
          onCancel={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null);
            await refresh();
            setFlash("That address was updated.");
          }}
        />
      ) : adding ? (
        <AddressForm
          canDefault={addresses.length > 0}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await refresh();
            setFlash("That address was saved.");
          }}
        />
      ) : addresses.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-sb-gold/45 px-4 py-5 text-sm text-sb-text-muted">
          Nothing saved yet. Add one here, or tick “save this address” when you
          next check out.
        </p>
      ) : (
        <>
          <ul className="mt-4">
            {addresses.map((address) => (
              <SavedAddress
                key={address.id}
                address={address}
                busy={busy}
                onEdit={() => {
                  setFlash(null);
                  setError(null);
                  setEditingId(address.id);
                }}
                onMakeDefault={() =>
                  run(
                    () => setDefaultAddress(address.id, token),
                    "Default address updated.",
                  )
                }
                onDelete={() =>
                  run(() => deleteAddress(address.id, token), "That address was removed.")
                }
              />
            ))}
          </ul>

          {full ? (
            <p className="mt-4 text-xs text-sb-text-muted">
              That is all {MAX_ADDRESSES}. Remove one to add another.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
