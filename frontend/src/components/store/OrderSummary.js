"use client";

/**
 * How an order looks on the storefront (F-07.02).
 *
 * One component, three places: the confirmation after checkout, the account
 * page's order history, and the guest tracking page. They are the same
 * receipt, and writing it three times is how the total ends up formatted
 * differently in each.
 *
 * Everything rendered here comes from the API's order DTO — the item lines
 * are the priced snapshot the server stored, not the bag the browser sent.
 * That matters: what the shop will charge is what shows, even if a price
 * changed between adding to the bag and checking out.
 */

import { Package } from "lucide-react";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { statusCopy } from "@/lib/store/orders";
import { Photo } from "./Photo";

/**
 * Badge colours per status tone.
 *
 * Deliberately not one colour per status: a shopper reads "is this moving or
 * not", and four shades of green would say less than three groups do.
 */
const TONE_CLASS = {
  wait: "border-sb-gold/50 bg-sb-surface/60 text-sb-gold-text",
  good: "border-sb-link/35 bg-sb-link/10 text-sb-link",
  done: "border-sb-gold/50 bg-sb-surface/70 text-sb-heading",
  off: "border-sb-text-muted/30 bg-sb-surface/40 text-sb-text-muted",
};

/** "30 August 2026" — long form, because a receipt is read, not scanned. */
const longDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

export function OrderStatusBadge({ status, className }) {
  const copy = statusCopy(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold",
        TONE_CLASS[copy.tone] ?? TONE_CLASS.wait,
        className,
      )}
    >
      {copy.label}
    </span>
  );
}

/** The lines, with the money underneath. Shared by every view of an order. */
export function OrderLines({ order, compact = false }) {
  return (
    <>
      <ul className={cn("divide-y divide-sb-gold/25", compact ? "" : "border-y border-sb-gold/25")}>
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-3 py-3">
            <div className="relative aspect-3/4 w-12 shrink-0 overflow-hidden rounded-lg border border-sb-gold/30 bg-sb-surface/40">
              <Photo
                src={item.imageUrl}
                alt={item.productName}
                seed={item.productId ?? item.id}
                sizes="48px"
                className="object-cover"
              />
            </div>

            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sb-heading">
                  {item.productName}
                </p>
                <p className="mt-0.5 text-xs text-sb-text-muted">
                  {item.size ? `Size ${item.size}` : "One size"} · {item.quantity} ×{" "}
                  {money(item.unitPrice)}
                </p>
              </div>

              <p className="shrink-0 text-sm font-bold text-sb-text tabular">
                {money(item.lineTotal)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-sb-text-muted">Subtotal</dt>
          <dd className="font-semibold text-sb-text tabular">{money(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-sb-text-muted">Shipping</dt>
          <dd className="font-semibold text-sb-text">
            {order.shippingFee > 0 ? money(order.shippingFee) : "Free all over India"}
          </dd>
        </div>
        <div className="flex justify-between border-t border-sb-gold/30 pt-2">
          <dt className="font-display text-base font-semibold text-sb-heading">Total</dt>
          <dd className="font-display text-base font-semibold text-sb-heading tabular">
            {money(order.total)}
          </dd>
        </div>
      </dl>
    </>
  );
}

/** Where it is going. Rendered from the order's own snapshot, never the account. */
export function OrderAddress({ order }) {
  const { shippingAddress: address, contact } = order;

  return (
    <div className="text-sm leading-relaxed text-sb-text-muted">
      <p className="font-semibold text-sb-text">{contact.name}</p>
      <p>{address.line1}</p>
      {address.line2 ? <p>{address.line2}</p> : null}
      {address.landmark ? <p>{address.landmark}</p> : null}
      <p>
        {address.city}, {address.state} {address.postalCode}
      </p>
      <p>{address.country}</p>
      <p className="mt-2 tabular">{contact.phone}</p>
      <p className="break-all">{contact.email}</p>
    </div>
  );
}

/**
 * A whole order as a card — header, status, lines, address.
 *
 * `actions` is a render slot rather than a set of props, because who may do
 * what differs by where this is shown: history offers cancelling, the
 * confirmation offers nothing, tracking is read-only.
 */
export function OrderCard({ order, actions = null, defaultOpen = false }) {
  const copy = statusCopy(order.status);

  return (
    <article className="rounded-2xl border border-sb-gold/35 bg-sb-bg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-sb-heading tabular">
            {order.orderNumber}
          </p>
          <p className="mt-0.5 text-xs text-sb-text-muted">
            Placed {longDate(order.timeline.placedAt)} · {order.unitCount}{" "}
            {order.unitCount === 1 ? "piece" : "pieces"}
          </p>
        </div>

        <div className="text-right">
          <OrderStatusBadge status={order.status} />
          <p className="mt-1.5 font-display text-lg font-semibold text-sb-heading tabular">
            {money(order.total)}
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-sb-surface/40 px-3.5 py-2.5 text-xs leading-relaxed text-sb-text-muted">
        <Package className="mt-0.5 size-3.5 shrink-0 text-sb-gold-text" aria-hidden="true" />
        <span>
          {copy.detail}
          {order.status === "cancelled" && order.cancellationReason
            ? ` ${order.cancellationReason}`
            : ""}
        </span>
      </p>

      <details className="group mt-3" open={defaultOpen}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-sb-link underline underline-offset-4 hover:text-sb-heading">
          <span className="group-open:hidden">Show the pieces and address</span>
          <span className="hidden group-open:inline">Hide the details</span>
        </summary>

        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="sb-eyebrow mb-2 text-[10px] text-sb-gold-text">Pieces</p>
            <OrderLines order={order} compact />
          </div>

          <div>
            <p className="sb-eyebrow mb-2 text-[10px] text-sb-gold-text">Delivering to</p>
            <OrderAddress order={order} />
          </div>
        </div>
      </details>

      {actions ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sb-gold/25 pt-3.5">
          {actions}
        </div>
      ) : null}
    </article>
  );
}
