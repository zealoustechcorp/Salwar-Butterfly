"use client";

/**
 * Checkout (F-07.01) — what replaced the WhatsApp hand-off.
 *
 * The bag used to be formatted into a message and opened in wa.me, because
 * there was no order API and pretending to check out would have been a lie.
 * There is one now, so this page takes the order itself.
 *
 * Three things about it are worth knowing before changing anything here.
 *
 * No account required. The bag has always promised checkout without signing
 * in, and the token is passed as `null` for a guest. Signing in is offered
 * once, as a convenience, and never as a gate.
 *
 * The server prices the order. This form sends variant ids and quantities;
 * every rupee shown on the right is a local preview of what the bag holds, and
 * the figures on the confirmation come back from the API. If they ever
 * disagree, the API is right — a price can change between adding to the bag
 * and paying, and the shopper is charged the real one.
 *
 * A refused checkout is not a failure state. "That size sold out while you
 * were checking out" arrives as a 409 with the piece named, and it is shown as
 * a sentence the shopper can act on, with the bag still intact behind it.
 *
 * Paying is not part of this form, and deliberately not. Placing the order is
 * what reserves the stock, so it has to succeed on its own before money is
 * asked for; the payment sheet opens on /checkout/done, from the same button
 * that offers it again to anyone who closed it the first time. One code path
 * for the first attempt and the retry — see <PayNow>.
 *
 * A signed-in shopper picks a saved address instead of typing one (F-08.01,
 * F-08.05), and the fields below stay exactly where they were — choosing a
 * saved address fills them in rather than replacing them with a summary. It
 * still has to be editable at the moment of buying: "the same address but send
 * it to the office this time" is one field, not a new address book entry.
 */

import { AlertCircle, Check, Loader2, Lock, MapPin, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { money } from "@/lib/format";
import {
  MAX_ADDRESSES,
  createAddress,
  fetchAddresses,
  isSameAddress,
} from "@/lib/store/addresses";
import { placeOrder } from "@/lib/store/orders";
import { cn } from "@/lib/utils";
import { formatAddress } from "./AddressBook";
import { useAuth } from "./AuthProvider";
import { Photo } from "./Photo";
import { useStore } from "./StoreProvider";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

/** Where the confirmation is handed off, so a refresh does not lose it. */
export const LAST_ORDER_KEY = "sb.lastOrder";

const STATES = [
  "Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana",
  "Maharashtra", "Gujarat", "Rajasthan", "Delhi", "Uttar Pradesh",
  "Madhya Pradesh", "West Bengal", "Odisha", "Bihar", "Punjab", "Haryana",
  "Assam", "Jharkhand", "Chhattisgarh", "Uttarakhand", "Himachal Pradesh",
  "Goa", "Puducherry", "Jammu and Kashmir",
];

/**
 * The form fields that make up the address, as opposed to the contact details
 * and the note sharing the same `values` object.
 *
 * Named once because three things need the same list: clearing the address for
 * a new one, noticing that a prefilled address has been edited, and comparing
 * what was typed against what is already saved.
 */
const ADDRESS_KEYS = ["line1", "line2", "landmark", "city", "state", "postalCode"];

const BLANK_ADDRESS = {
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "Tamil Nadu",
  postalCode: "",
};

/** A saved address, in the shape this form's `values` holds. */
const addressToValues = (address) => ({
  line1: address.line1 ?? "",
  line2: address.line2 ?? "",
  landmark: address.landmark ?? "",
  city: address.city ?? "",
  state: address.state ?? "Tamil Nadu",
  postalCode: address.postalCode ?? "",
});

function Field({ id, label, error, hint, children, className }) {
  return (
    <div className={className}>
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

export function CheckoutView() {
  const { bag, bagTotal, bagCount, clearBag } = useStore();
  const { user, isSignedIn, token, openAuth } = useAuth();
  const router = useRouter();

  // Prefilled from the account where there is one, and still editable: a gift
  // goes to a different name and address than the one on the account.
  const [values, setValues] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "Tamil Nadu",
    postalCode: "",
    customerNote: "",
  });

  const [failure, setFailure] = useState(null); // { field, error }
  const [pending, setPending] = useState(false);

  // --------------------------------------------------------
  // SAVED ADDRESSES (F-08.01, F-08.05)
  // --------------------------------------------------------
  //
  // Guests never see any of this: `token` is null for them, the fetch never
  // runs, and the form below is exactly the form it always was.
  //
  // `chosen` is an address id, or "new" for the one they are typing. It is
  // only ever a label for which radio is filled in — the order still sends
  // whatever is in `values`, so editing a prefilled field is not a special
  // case that has to be detected.

  const [saved, setSaved] = useState([]);
  const [chosen, setChosen] = useState("new");
  const [saveToAccount, setSaveToAccount] = useState(false);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetchAddresses(token, { signal: controller.signal })
      .then((result) => {
        if (!result.ok || result.addresses.length === 0) return;

        setSaved(result.addresses);

        // The default, or the first — the API sorts it to the front. Filling
        // the form is the whole point: a returning shopper should be able to
        // read the address, check it and pay without touching a field.
        const preferred = result.addresses[0];

        setChosen(preferred.id);
        setValues((current) => ({ ...current, ...addressToValues(preferred) }));
      })
      .catch((cause) => {
        // A checkout that cannot load the address book is a checkout with an
        // empty address form, which still works. Nothing is shown for it.
        if (cause?.name !== "AbortError") setSaved([]);
      });

    return () => controller.abort();
  }, [token]);

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [key]: value }));

    // Typing in an address field means this is no longer the saved address it
    // was filled from, whatever the radio says. Contact fields are left alone:
    // a gift goes to a different name at the same address.
    if (ADDRESS_KEYS.includes(key)) setChosen("new");

    // Clear the message the moment they start fixing the field it blamed.
    setFailure((current) => (current?.field?.endsWith(key) ? null : current));
  };

  /** Fills the form from a saved address, or empties it for a new one. */
  const pick = (address) => {
    setChosen(address?.id ?? "new");
    setFailure(null);
    setValues((current) => ({
      ...current,
      ...(address ? addressToValues(address) : BLANK_ADDRESS),
    }));
  };

  /**
   * Lines saved on this device before the catalogue moved into the database
   * have no variant id and cannot be ordered — there is no row to price or
   * reserve against. Called out by name so the shopper knows which line to
   * remove rather than being told "checkout failed".
   */
  const unorderable = bag.filter((line) => !line.variant_id);

  const errorFor = (field) => (failure?.field === field ? failure.error : null);

  /**
   * Whether to offer to keep this address (F-08.05).
   *
   * Not offered when: they are a guest, they picked one that is already
   * saved, the book is full, they have not typed enough of an address to be
   * worth keeping, or what they typed would put a parcel in the same place as
   * something already in there. That last one is the case that matters — a
   * shopper who retypes their own address rather than picking it should not
   * end up with two copies and one slot left.
   */
  const offerToSave =
    isSignedIn &&
    chosen === "new" &&
    saved.length < MAX_ADDRESSES &&
    Boolean(values.line1.trim() && values.city.trim() && values.postalCode.trim()) &&
    !saved.some((address) => isSameAddress(address, values));

  async function onSubmit(event) {
    event.preventDefault();
    if (pending) return;

    setFailure(null);
    setPending(true);

    const result = await placeOrder(
      {
        contact: {
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
        },
        shippingAddress: {
          line1: values.line1.trim(),
          line2: values.line2.trim() || undefined,
          landmark: values.landmark.trim() || undefined,
          city: values.city.trim(),
          state: values.state.trim(),
          postalCode: values.postalCode.trim(),
          country: "India",
        },
        items: bag
          .filter((line) => line.variant_id)
          .map((line) => ({ variantId: line.variant_id, quantity: line.qty })),
        customerNote: values.customerNote.trim(),
      },
      token,
    );

    if (!result.ok) {
      setPending(false);

      // The API names the offending field as `contact.email` or
      // `shippingAddress.city`; the inputs here are flat, so the last segment
      // is what identifies one.
      setFailure({
        field: result.field ? result.field.split(".").pop() : null,
        error: result.error,
      });

      return;
    }

    // The order exists on the server now. Everything below is presentation,
    // and none of it may throw the shopper back onto a checkout form for an
    // order that already went through.

    // Saving the address is a convenience bolted onto a sale that has already
    // happened, so it runs here rather than before the order and its failure
    // is swallowed. A shopper who paid does not need to hear that their
    // address book is full.
    if (offerToSave && saveToAccount) {
      await createAddress(
        {
          ...BLANK_ADDRESS,
          ...Object.fromEntries(ADDRESS_KEYS.map((key) => [key, values[key].trim()])),
          label: "",
          country: "India",
          isDefault: saved.length === 0,
        },
        token,
      ).catch(() => {});
    }

    try {
      window.sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(result.order));
    } catch {
      /* the confirmation page falls back to asking them to look it up */
    }

    clearBag();
    router.replace("/checkout/done");
  }

  // --------------------------------------------------------
  // NOTHING TO BUY
  // --------------------------------------------------------

  if (!bag.length) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-14 lg:px-8">
        <p className="sb-eyebrow text-[10px] text-sb-gold-text">Checkout</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
          Your bag is empty
        </h1>
        <div className="mt-6 rounded-2xl border border-dashed border-sb-gold/50 bg-sb-surface/25 px-6 py-14 text-center">
          <ShoppingBag className="mx-auto size-8 text-sb-gold-text" aria-hidden="true" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-sb-text-muted">
            There is nothing to check out. Add a piece and come back.
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose"
          >
            Start shopping
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-11 lg:px-8 lg:py-13">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Checkout</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl lg:text-5xl">
        Where should it go?
      </h1>

      {!isSignedIn ? (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
          You are checking out as a guest, which is perfectly fine.{" "}
          <button
            type="button"
            onClick={() =>
              openAuth({ reason: "Signing in keeps this order in your account." })
            }
            className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
          >
            Sign in
          </button>{" "}
          only if you want it kept under your account — otherwise your order
          number and email are all you need to track it.
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-7 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <div>
          {unorderable.length ? (
            <div className="mb-6 flex gap-3 rounded-xl border border-sb-link/40 bg-sb-link/5 px-4 py-3.5">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-sb-link" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-sb-heading">
                  {unorderable.length === 1
                    ? "One piece in your bag can no longer be ordered"
                    : `${unorderable.length} pieces in your bag can no longer be ordered`}
                </p>
                <p className="mt-1 leading-relaxed text-sb-text-muted">
                  {unorderable.map((line) => line.name).join(", ")} — the
                  catalogue has moved on since these were saved.{" "}
                  <Link
                    href="/bag"
                    className="font-semibold text-sb-link underline underline-offset-4"
                  >
                    Remove them in your bag
                  </Link>{" "}
                  and add them again.
                </p>
              </div>
            </div>
          ) : null}

          {/* ---------- CONTACT ---------- */}

          {/* One fieldset for the whole form, so submitting disables every
              control at once. Its sections are headings rather than nested
              legends — a fieldset takes one legend, and two would be invalid. */}
          <fieldset disabled={pending} className="disabled:opacity-60">
            <h2 className="sb-eyebrow text-[10px] text-sb-gold-text">Contact</h2>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field id="co-name" label="Full name" error={errorFor("name")}>
                <input
                  id="co-name"
                  value={values.name}
                  onChange={set("name")}
                  autoComplete="name"
                  placeholder="Meera Krishnan"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field
                id="co-phone"
                label="Phone"
                error={errorFor("phone")}
                hint="The courier calls this number."
              >
                <input
                  id="co-phone"
                  type="tel"
                  value={values.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                  placeholder="9876543210"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field
                id="co-email"
                label="Email"
                error={errorFor("email")}
                hint="Your order number is tied to this address."
                className="sm:col-span-2"
              >
                <input
                  id="co-email"
                  type="email"
                  value={values.email}
                  onChange={set("email")}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={FIELD_CLASS}
                />
              </Field>
            </div>

            {/* ---------- ADDRESS ---------- */}

            <h2 className="sb-eyebrow mt-8 text-[10px] text-sb-gold-text">
              Shipping address
            </h2>

            {/*
              The picker, for a shopper who has addresses saved. Radios rather
              than a <select>: there are at most three, each is three lines
              long, and a dropdown would hide the one thing worth reading —
              which address this parcel is about to go to.
            */}
            {saved.length ? (
              <div className="mt-3" role="radiogroup" aria-label="Delivery address">
                {saved.map((address) => (
                  <label
                    key={address.id}
                    className={cn(
                      "mt-2 flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors first:mt-0",
                      chosen === address.id
                        ? "border-sb-heading bg-sb-surface/40"
                        : "border-sb-gold/40 hover:border-sb-heading/60",
                    )}
                  >
                    <input
                      type="radio"
                      name="co-saved-address"
                      checked={chosen === address.id}
                      onChange={() => pick(address)}
                      className="mt-1 size-4 shrink-0 accent-sb-btn-primary"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-sb-heading">
                        <MapPin className="size-3.5 shrink-0 text-sb-gold-text" aria-hidden="true" />
                        {address.label || "Delivery address"}
                        {address.isDefault ? (
                          <span className="rounded-full bg-sb-surface-pink px-2 py-0.5 text-[10px] font-semibold text-sb-ink-on-pink">
                            Default
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-sb-text-muted">
                        {formatAddress(address)}
                      </span>
                    </span>
                  </label>
                ))}

                <label
                  className={cn(
                    "mt-2 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
                    chosen === "new"
                      ? "border-sb-heading bg-sb-surface/40 text-sb-heading"
                      : "border-sb-gold/40 text-sb-text hover:border-sb-heading/60",
                  )}
                >
                  <input
                    type="radio"
                    name="co-saved-address"
                    checked={chosen === "new"}
                    onChange={() => pick(null)}
                    className="size-4 shrink-0 accent-sb-btn-primary"
                  />
                  Send it somewhere else
                </label>

                <p className="mt-2.5 text-xs text-sb-text-muted">
                  {chosen === "new"
                    ? "Fill in the address below. This order will not change your saved ones."
                    : "Edit anything below and it applies to this order only."}
                </p>
              </div>
            ) : null}

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                id="co-line1"
                label="Address"
                error={errorFor("line1")}
                className="sm:col-span-2"
              >
                <input
                  id="co-line1"
                  value={values.line1}
                  onChange={set("line1")}
                  autoComplete="address-line1"
                  placeholder="14 Bharathi Street"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field id="co-line2" label="Area (optional)" error={errorFor("line2")}>
                <input
                  id="co-line2"
                  value={values.line2}
                  onChange={set("line2")}
                  autoComplete="address-line2"
                  placeholder="Gandhipuram"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field id="co-landmark" label="Landmark (optional)" error={errorFor("landmark")}>
                <input
                  id="co-landmark"
                  value={values.landmark}
                  onChange={set("landmark")}
                  placeholder="Opposite the water tank"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field id="co-city" label="City" error={errorFor("city")}>
                <input
                  id="co-city"
                  value={values.city}
                  onChange={set("city")}
                  autoComplete="address-level2"
                  placeholder="Coimbatore"
                  className={FIELD_CLASS}
                />
              </Field>

              <Field id="co-postal" label="PIN code" error={errorFor("postalCode")}>
                <input
                  id="co-postal"
                  inputMode="numeric"
                  value={values.postalCode}
                  onChange={set("postalCode")}
                  autoComplete="postal-code"
                  placeholder="641012"
                  maxLength={6}
                  className={cn(FIELD_CLASS, "tabular")}
                />
              </Field>

              <Field id="co-state" label="State" error={errorFor("state")} className="sm:col-span-2">
                <select
                  id="co-state"
                  value={values.state}
                  onChange={set("state")}
                  autoComplete="address-level1"
                  className={FIELD_CLASS}
                >
                  {STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                id="co-note"
                label="Anything the shop should know? (optional)"
                error={errorFor("customerNote")}
                className="sm:col-span-2"
              >
                <textarea
                  id="co-note"
                  value={values.customerNote}
                  onChange={set("customerNote")}
                  rows={2}
                  maxLength={1000}
                  placeholder="Please deliver after 6pm"
                  className="w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 py-2.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none"
                />
              </Field>
            </div>

            {/*
              Offered rather than assumed, and unticked by default. Keeping an
              address is the shopper's decision to make — see `offerToSave`
              above for the cases where it is not offered at all.
            */}
            {offerToSave ? (
              <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-sb-text">
                <input
                  type="checkbox"
                  checked={saveToAccount}
                  onChange={(event) => setSaveToAccount(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-sb-gold/50 accent-sb-btn-primary"
                />
                <span>
                  Save this address to my account
                  <span className="mt-0.5 block text-xs text-sb-text-muted">
                    {saved.length
                      ? `You have ${saved.length} of ${MAX_ADDRESSES} saved.`
                      : "So you can pick it next time instead of typing it again."}
                  </span>
                </span>
              </label>
            ) : null}

            {/*
              The one case worth explaining rather than silently hiding the
              box: they have filled the book, and nothing they do on this
              form will change that.
            */}
            {isSignedIn && chosen === "new" && saved.length >= MAX_ADDRESSES ? (
              <p className="mt-5 flex items-start gap-2 text-xs text-sb-text-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-sb-gold-text" aria-hidden="true" />
                This order will go to the address above. Your {MAX_ADDRESSES} saved
                addresses stay as they are —{" "}
                <Link
                  href="/account#addresses"
                  className="font-semibold text-sb-link underline underline-offset-4"
                >
                  manage them in your account
                </Link>
                .
              </p>
            ) : null}
          </fieldset>
        </div>

        {/* ---------- SUMMARY ---------- */}

        <aside className="lg:sticky lg:top-44 lg:self-start wide:top-28">
          <div className="rounded-2xl border border-sb-gold/35 bg-sb-bg p-5 sm:p-6">
            <p className="sb-eyebrow text-[10px] text-sb-gold-text">
              {bagCount} {bagCount === 1 ? "piece" : "pieces"}
            </p>

            <ul className="mt-3 divide-y divide-sb-gold/25 border-y border-sb-gold/25">
              {bag.map((line) => (
                <li key={line.key} className="flex gap-3 py-3">
                  <div className="relative aspect-3/4 w-11 shrink-0 overflow-hidden rounded-lg border border-sb-gold/30 bg-sb-surface/40">
                    <Photo
                      src={line.image}
                      alt={line.name}
                      seed={line.product_id}
                      sizes="44px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-sb-heading">
                        {line.name}
                      </p>
                      <p className="mt-0.5 text-xs text-sb-text-muted">
                        {line.size ? `Size ${line.size}` : "One size"} · × {line.qty}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-sb-text tabular">
                      {money(line.price * line.qty)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-sb-text-muted">Subtotal</dt>
                <dd className="font-semibold text-sb-text tabular">{money(bagTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sb-text-muted">Shipping</dt>
                <dd className="font-semibold text-sb-text">Free all over India</dd>
              </div>
              <div className="flex justify-between border-t border-sb-gold/30 pt-2">
                <dt className="font-display text-lg font-semibold text-sb-heading">Total</dt>
                <dd className="font-display text-lg font-semibold text-sb-heading tabular">
                  {money(bagTotal)}
                </dd>
              </div>
            </dl>

            {/* A refusal that named no field — sold out, or the API is down.
                Shown against the button rather than beside an input, because
                there is no input at fault. */}
            {failure && !failure.field ? (
              <p className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-3.5 py-2.5 text-xs leading-relaxed font-medium text-sb-link">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {failure.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending || unorderable.length > 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-5 py-3.5 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="size-4" aria-hidden="true" />
              )}
              {pending ? "Placing your order…" : "Place order"}
            </button>

            <p className="mt-3 text-xs leading-relaxed text-sb-text-muted">
              Nothing is charged yet. The shop confirms your order and sends a
              payment link — GPay, PhonePe, Paytm, cards or net banking. No cash
              on delivery.
            </p>

            <div className="mt-4 border-t border-sb-gold/30 pt-3.5">
              <Link
                href="/bag"
                className="text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
              >
                Back to the bag
              </Link>
            </div>
          </div>

          <p className="mt-4 px-1 text-xs leading-relaxed text-sb-text-muted">
            Your sizes are held for you the moment this order is placed. Delivery
            takes 5 to 10 working days.
          </p>
        </aside>
      </form>
    </section>
  );
}
