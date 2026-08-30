"use client";

/**
 * Looking up an order without an account (F-07.02).
 *
 * The shop's promise has always been that you can buy without signing up, and
 * that promise is only kept if a guest can also find their order afterwards.
 * Two fields do it: the number from the confirmation, and the email it was
 * placed with.
 *
 * Both are required, and that is a security decision rather than a form
 * design one. Order numbers run in sequence, so knowing one is knowing roughly
 * where every other one is; the email is what stops a stranger walking the
 * list. The API fails a wrong number and a wrong email identically, so this
 * page cannot be used to discover which numbers exist.
 */

import { AlertCircle, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { trackOrder } from "@/lib/store/orders";
import { OrderCard } from "./OrderSummary";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-sb-gold/45 bg-white/70 px-3.5 text-sm text-sb-text placeholder:text-sb-text-muted/60 focus:border-sb-link focus:bg-white focus:outline-none";

export function TrackOrder() {
  const [values, setValues] = useState({ orderNumber: "", email: "" });
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const set = (key) => (event) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setError(null);
  };

  async function onSubmit(event) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    const result = await trackOrder({
      orderNumber: values.orderNumber.trim(),
      email: values.email.trim(),
    });

    setPending(false);

    if (!result.ok) {
      setOrder(null);
      setError(result.error);
      return;
    }

    setOrder(result.order);
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-9 sm:px-6 sm:py-13 lg:px-8">
      <p className="sb-eyebrow text-[10px] text-sb-gold-text">Track an order</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-sb-heading sm:text-4xl">
        Where is my parcel?
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-sb-text-muted">
        Enter the order number from your confirmation and the email you used.
        No account needed.
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
              className={`${FIELD_CLASS} mt-1.5 tabular`}
            />
          </div>

          <div>
            <label htmlFor="track-email" className="block text-xs font-semibold text-sb-text">
              Email
            </label>
            <input
              id="track-email"
              type="email"
              value={values.email}
              onChange={set("email")}
              placeholder="you@example.com"
              autoComplete="email"
              className={`${FIELD_CLASS} mt-1.5`}
            />
          </div>
        </fieldset>

        {error ? (
          <p className="mt-4 flex gap-2 rounded-xl border border-sb-link/40 bg-sb-link/5 px-4 py-3 text-sm font-medium text-sb-link">
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
