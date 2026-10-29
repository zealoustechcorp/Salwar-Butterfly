"use client";

/**
 * Looking up an order without an account (F-07.02).
 *
 * The shop's promise has always been that you can buy without signing up, and
 * that promise is only kept if a guest can also find their order afterwards.
 * Two fields do it: the number from the confirmation, and the mobile number
 * (or email) it was placed with. One box takes either — anything with an "@"
 * is read as an email. The phone is the one every order has; email is optional
 * at checkout.
 *
 * Both are required, and that is a security decision rather than a form
 * design one. Order numbers run in sequence, so knowing one is knowing roughly
 * where every other one is; the phone or email is what stops a stranger walking
 * the list. The API fails a wrong number and a wrong contact identically, so this
 * page cannot be used to discover which numbers exist.
 *
 * The "Track your order" button in the confirmation email links here with
 * both already filled in — `/track#order=SB-001042&email=…` (or `&phone=…`) — and the page
 * looks the order up as it opens. The details ride in the fragment so they
 * never reach a server log, and are wiped from the address bar once read.
 */

import { AlertCircle, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { trackOrder } from "@/lib/store/orders";
import {
  collect,
  hasErrors,
  normalizeOrderNumber,
  summarizeErrors,
  validateEmail,
  validateOrderNumber,
  validatePhone,
} from "@/lib/validate";
import { cn } from "@/lib/utils";
import { OrderCard } from "./OrderSummary";
import { useStoreToast } from "./Toast";

// 16px below `sm`: iOS Safari zooms the page in on focus for anything smaller.
/** Anything with an "@" in it is an email; everything else a phone number. */
const isEmail = (value) => value.includes("@");

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-base text-sb-text sm:text-sm placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

export function TrackOrder() {
  const toast = useStoreToast();

  const [values, setValues] = useState({ orderNumber: "", contact: "" });
  const [order, setOrder] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setError(null);
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function onSubmit(event) {
    event.preventDefault();
    lookUp(values);
  }

  async function lookUp(input) {
    if (pending) return;

    setValues(input);
    setError(null);

    // Both fields are checked because both are required, and required for
    // the same reason: order numbers run in sequence, so the contact is what
    // stops the page being walked. A blank one has to fail here rather than
    // arriving as a lookup the API answers "not found" — that reads as a
    // missing order rather than a missing field.
    const invalid = collect([
      ["orderNumber", validateOrderNumber(input.orderNumber)],
      [
        "contact",
        input.contact.trim()
          ? isEmail(input.contact)
            ? validateEmail(input.contact)
            : validatePhone(input.contact)
          : "Enter your mobile number or email",
      ],
    ]);

    if (hasErrors(invalid)) {
      setErrors(invalid);
      toast.error("Check what you entered", summarizeErrors(invalid));
      return;
    }

    setErrors({});
    setPending(true);

    const result = await trackOrder({
      // "1042" and "sb-1042" both become the "SB-001042" on the
      // confirmation. Somebody reading a number off a screen types the
      // digits, and refusing that would be the form being difficult about
      // a number it understood perfectly well.
      orderNumber: normalizeOrderNumber(input.orderNumber),
      ...(isEmail(input.contact)
        ? { email: input.contact.trim() }
        : { phone: input.contact.trim() }),
    });

    setPending(false);

    if (!result.ok) {
      setOrder(null);
      setError(result.error);
      toast.error("No order found", "Check the order number and the mobile number or email it was placed with.");
      return;
    }

    setOrder(result.order);
    toast.success(
      `Order ${result.order.orderNumber} found`,
      "It is shown below with everything on it.",
    );
  }

  /**
   * `/track#order=…&email=…`, from the confirmation email: fill the form and
   * look the order up straight away. Read once, then removed from the URL so
   * the email address does not sit in the address bar or the history entry.
   */
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const linked = {
      orderNumber: params.get("order")?.trim() ?? "",
      contact: (params.get("email") || params.get("phone"))?.trim() ?? "",
    };

    if (!linked.orderNumber && !linked.contact) return;

    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    lookUp(linked);
    // Once, on arrival — `lookUp` is recreated every render and must not
    // re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-13 lg:px-8">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Track an order</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
        Where is my parcel?
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
        Enter the order number from your confirmation and the mobile number
        (or email) you used at checkout. No account needed.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6">
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="track-number" className="block text-xs font-semibold text-sb-text">
              Order number
            </label>
            <input
              id="track-number"
              value={values.orderNumber}
              onChange={set("orderNumber")}
              placeholder="SB-001042"
              autoComplete="off"
              maxLength={24}
              aria-invalid={Boolean(errors.orderNumber)}
              aria-describedby={errors.orderNumber ? "track-number-error" : undefined}
              className={cn(FIELD_CLASS, "mt-1.5 tabular", errors.orderNumber && "border-sb-link")}
            />
            {errors.orderNumber ? (
              <p id="track-number-error" className="mt-1.5 text-xs font-medium text-sb-link">
                {errors.orderNumber}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="track-contact" className="block text-xs font-semibold text-sb-text">
              Mobile number or email
            </label>
            <input
              id="track-contact"
              value={values.contact}
              onChange={set("contact")}
              placeholder="9876543210"
              autoComplete="tel"
              aria-invalid={Boolean(errors.contact)}
              aria-describedby={errors.contact ? "track-contact-error" : undefined}
              className={cn(FIELD_CLASS, "mt-1.5", errors.contact && "border-sb-link")}
            />
            {errors.contact ? (
              <p id="track-contact-error" className="mt-1.5 text-xs font-medium text-sb-link">
                {errors.contact}
              </p>
            ) : null}
          </div>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-4 py-3 text-sm font-medium text-sb-link"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-sb-btn-primary px-7 py-3 text-sm font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose disabled:cursor-not-allowed disabled:bg-sb-text-muted/40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          Find my order
        </button>
      </form>

      {order ? (
        <div className="mt-8">
          <OrderCard order={order} defaultOpen />
        </div>
      ) : null}

      <p className="mt-8 border-t border-sb-gold/30 pt-5 text-sm leading-relaxed text-sb-text-muted">
        Signed in?{" "}
        <Link
          href="/account#my-orders"
          className="font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading"
        >
          Your orders are all listed on your account
        </Link>{" "}
        — no number needed.
      </p>
    </section>
  );
}
