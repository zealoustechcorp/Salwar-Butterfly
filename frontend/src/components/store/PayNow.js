"use client";

/**
 * "Pay now" (F-10).
 *
 * One component owns the whole payment round trip — open a session, show the
 * sheet, hand the answer back to the API — because it happens in two places
 * and both must behave identically: straight after checkout, and again on the
 * confirmation page for anyone who closed the sheet the first time.
 *
 * The states it has to render are the point of it:
 *
 *   the gateway is off     A backend with no Razorpay keys is a working
 *                          backend. This renders nothing at all then, and the
 *                          page's own copy about the shop being in touch is
 *                          the truth. Never a button that fails when pressed.
 *
 *   dismissed              Not an error. The order exists, the pieces are
 *                          still held, and the button simply comes back.
 *
 *   failed                 A declined card. Says nothing has been charged,
 *                          because nothing has, and offers another go.
 *
 *   verified but unsure    The rarest and the one worth getting right: the
 *                          money left the shopper's account and our verify
 *                          call did not come back. Razorpay's webhook will
 *                          confirm it server-side within seconds, so this
 *                          must never say "payment failed" — it says the
 *                          money was taken and the shop is confirming it.
 */

import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createPaymentSession, fetchPaymentConfig, verifyPayment } from "@/lib/store/payments";
import { openCheckout, PAYMENT_RESULT } from "@/lib/store/razorpay";
import { cn } from "@/lib/utils";

import { useAuth } from "./AuthProvider";

export function PayNow({
  order,
  shop,
  onPaid,
  className,
  label = "Pay now",
  // Smaller, for a row in a list of orders rather than the one action on a
  // confirmation page.
  compact = false,
}) {
  const { token } = useAuth();

  // `null` while we are still asking. Rendering a button before the answer
  // arrives would flash one onto a shop that cannot take payment.
  const [enabled, setEnabled] = useState(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }

  useEffect(() => {
    const controller = new AbortController();

    fetchPaymentConfig({ signal: controller.signal })
      .then((config) => setEnabled(Boolean(config?.enabled)))
      .catch(() => {
        /* aborted on unmount; the state is gone either way */
      });

    return () => controller.abort();
  }, []);

  async function pay() {
    if (pending) return;

    setPending(true);
    setNotice(null);

    // ---- open a session -------------------------------------

    const opened = await createPaymentSession(order.id, token);

    if (!opened.ok) {
      setPending(false);
      setNotice({ tone: "error", text: opened.error });
      return;
    }

    // ---- the sheet ------------------------------------------

    const result = await openCheckout(opened.session, shop);

    if (result.status === PAYMENT_RESULT.DISMISSED) {
      setPending(false);
      setNotice({
        tone: "quiet",
        text: "Payment cancelled. Your order is still here — the pieces are held for you.",
      });
      return;
    }

    if (result.status !== PAYMENT_RESULT.SUCCESS) {
      setPending(false);
      setNotice({ tone: "error", text: result.error });
      return;
    }

    // ---- verify ---------------------------------------------
    //
    // Still `pending` on purpose. The money has moved; the button must
    // not become pressable again while we are finding out whether the
    // server agrees.

    const verified = await verifyPayment(result.payment);

    setPending(false);

    if (!verified.ok) {
      // The one case that must not read as a failure. Razorpay has taken
      // the money and told us so; only our own confirmation call did not
      // land. The webhook settles the same payment server-side, so the
      // order will confirm itself shortly.
      setNotice({
        tone: "quiet",
        text:
          "Your payment went through and the shop is confirming it. " +
          "This can take a moment — refresh, or check your order with its number.",
      });

      return;
    }

    onPaid?.(verified.order);
  }

  // Asked and answered: this shop cannot take card payments right now, so
  // there is nothing to offer.
  if (enabled === false) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={pay}
        disabled={pending || enabled === null}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full bg-sb-btn-primary",
          "font-semibold text-sb-bg transition-colors hover:bg-sb-btn-rose",
          "disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-5 py-2 text-xs" : "px-7 py-3 text-sm",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard className="size-4" aria-hidden="true" />
        )}
        {pending ? "Opening payment…" : label}
      </button>

      {notice ? (
        <p
          role="status"
          className={cn(
            "mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed",
            notice.tone === "error" ? "font-medium text-sb-link" : "text-sb-text-muted",
          )}
        >
          {notice.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : null}
          <span>{notice.text}</span>
        </p>
      ) : null}
    </div>
  );
}
