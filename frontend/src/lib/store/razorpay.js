/**
 * Razorpay's checkout script, wrapped in a promise (F-10).
 *
 * Two things this file exists to hide from the components above it.
 *
 * The script is loaded on demand rather than in the document head. It is
 * ~100KB of third-party JavaScript that only matters to someone who has
 * reached the last step of checkout, and loading it on every page view — for
 * the whole storefront, most of whom are browsing — would be a real cost paid
 * by almost nobody. `loadCheckoutScript` is idempotent, so pressing "Pay now"
 * twice does not add a second <script>.
 *
 * And the sheet's three outcomes are turned into one resolved value. Razorpay
 * reports success through a `handler` callback, failure through an event
 * listener, and "the shopper closed it" through `modal.ondismiss` — three
 * different shapes, none of them a promise, and only one of which ever fires.
 * Everything above here reads a single `{ status }`.
 *
 * Nothing in this file decides whether a payment counted. The sheet's success
 * callback is a claim made by a script running in the shopper's browser; it
 * is only worth anything once the API has checked its signature. See
 * lib/store/payments.js.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** The outcomes a caller has to handle. */
export const PAYMENT_RESULT = {
  /** Razorpay says it went through. Unverified until the API says so. */
  SUCCESS: "success",

  /** The shopper closed the sheet. Not an error — their order is still there. */
  DISMISSED: "dismissed",

  /** Razorpay reported a failure: a declined card, a timed-out UPI request. */
  FAILED: "failed",

  /** The script would not load. Usually an ad blocker or a dead connection. */
  UNAVAILABLE: "unavailable",
};

let scriptPromise = null;

/**
 * Loads the checkout script once per page.
 *
 * The promise is cached rather than the boolean, so two callers racing during
 * the load both wait on the same request instead of the second one starting
 * another. A failed load clears the cache so a retry can genuinely retry.
 */
export function loadCheckoutScript() {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.Razorpay) return Promise.resolve(true);

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");

      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        scriptPromise = null;
        resolve(false);
      };

      document.body.appendChild(script);
    });
  }

  return scriptPromise;
}

/**
 * Opens the payment sheet and resolves once it is done with.
 *
 * @param {object} session   the API's payment session — see
 *                           PaymentMapper.toSessionDTO on the server
 * @param {object} shop      for the sheet's title and logo
 * @returns {Promise<{status: string, payment?: object, error?: string}>}
 */
export async function openCheckout(session, shop) {
  const ready = await loadCheckoutScript();

  if (!ready) {
    return {
      status: PAYMENT_RESULT.UNAVAILABLE,
      error:
        "The payment window could not be loaded. An ad blocker will do this — " +
        "try again with it paused, or on another browser.",
    };
  }

  return new Promise((resolve) => {
    // A failed attempt is not the end of the sheet. Razorpay keeps it
    // open and offers "Retry payment" on the same order, so a declined
    // card can be followed by a successful UPI payment moments later.
    // Settling on the failure event would swallow that success — the
    // handler below would find the promise already settled, verifyPayment
    // would never be called, and a shopper who paid would be told they
    // had not. So a failure is only remembered here, and becomes the
    // answer when the sheet is closed without a later success.
    let settled = false;
    let lastFailure = null;

    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const razorpay = new window.Razorpay({
      key: session.keyId,
      order_id: session.providerOrderId,

      // Paise, as the API computed it. Razorpay reads the real figure
      // off the order it holds, so this is only what the sheet displays
      // — but a mismatch here would show the shopper one number and
      // charge another, so it comes from the same place.
      amount: session.amountInPaise,
      currency: session.currency,

      name: shop?.name ?? "Salwar Butterfly",
      description: `Order ${session.orderNumber}`,
      image: shop?.logo ?? undefined,

      // Saves retyping what checkout just asked for.
      prefill: {
        name: session.prefill?.name ?? "",
        email: session.prefill?.email ?? "",
        contact: session.prefill?.contact ?? "",
      },

      notes: { order_number: session.orderNumber },

      // The storefront's gold, so the sheet does not arrive in
      // Razorpay's default blue on a cream page.
      theme: { color: "#8f6b3f" },

      handler: (response) =>
        settle({
          status: PAYMENT_RESULT.SUCCESS,
          payment: {
            providerOrderId: response.razorpay_order_id,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          },
        }),

      modal: {
        // Fires when the shopper closes the sheet without paying. Their
        // order still exists and their stock is still held, so this is a
        // pause rather than a failure, and the copy above says so — unless
        // an attempt failed before they gave up, in which case its reason
        // is the more useful thing to show.
        ondismiss: () =>
          settle(lastFailure ?? { status: PAYMENT_RESULT.DISMISSED }),

        // Without this, closing the sheet by clicking the backdrop can
        // leave the page scroll-locked behind a modal that is gone.
        escape: true,
      },
    });

    // Remembered, not settled — see the note at the top of the promise.
    razorpay.on("payment.failed", (event) => {
      lastFailure = {
        status: PAYMENT_RESULT.FAILED,
        error:
          event?.error?.description ??
          "The payment did not go through. Nothing has been charged.",
      };
    });

    razorpay.open();
  });
}
