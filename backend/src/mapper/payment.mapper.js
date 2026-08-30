// src/mapper/payment.mapper.js
//
// Payment attempts → what each audience may see (F-10).
//
// Two DTOs, and the split is a security boundary rather than a
// convenience. `toSessionDTO` is handed to a browser and to whoever is
// watching that browser's network tab; `toAdminDTO` goes behind
// requireAdmin. Anything that reads like a gateway internal — the error
// code Razorpay returned, which attempt number this was — belongs in the
// second and not the first.

import { PAYMENT_PROVIDER } from "../config/payment.policy.js";

const toMoney = (value) => (value === null || value === undefined ? null : Number(value));

export const PaymentMapper = {
  /**
   * What the storefront needs to open a payment sheet.
   *
   * `keyId` is Razorpay's publishable key. It is meant to be in the page
   * — it identifies the merchant to their checkout script and can do
   * nothing on its own — and it is served from here rather than baked
   * into the frontend build so that rotating a key, or moving from test
   * to live, is an API restart and not a redeploy of the storefront.
   *
   * Deliberately absent: our own payment row id. The browser has no use
   * for it, and the verify endpoint looks the attempt up from the
   * provider's order id, which is the only id the gateway will echo back.
   */
  toSessionDTO({ payment, order, keyId }) {
    return {
      provider: payment.provider,
      keyId,

      // Razorpay's handles. Passed straight into their checkout script.
      providerOrderId: payment.provider_order_id,

      // Paise, because that is what the checkout script expects and
      // converting it again in the browser is one more place to drop a
      // factor of a hundred. The rupee figure is on the order.
      amountInPaise: Math.round(Number(payment.amount) * 100),
      currency: payment.currency,

      orderId: order.id,
      orderNumber: order.order_number,
      amount: toMoney(payment.amount),

      // Prefills the sheet so the shopper does not retype what checkout
      // already asked for. All three came from them a moment ago.
      prefill: {
        name: order.contact_name ?? "",
        email: order.contact_email ?? "",
        contact: order.contact_phone ?? "",
      },
    };
  },

  /**
   * One attempt, for the admin order page.
   *
   * The failure columns are the point of this shape: "declined twice on
   * a card, then paid by UPI" is the answer to a support call, and it is
   * unreadable from `orders.payment_status` alone.
   */
  toAdminDTO(row) {
    if (!row) return null;

    return {
      id: row.id,
      orderId: row.order_id,

      provider: row.provider,
      isManual: row.provider === PAYMENT_PROVIDER.MANUAL,

      status: row.status,
      amount: toMoney(row.amount),
      currency: row.currency,
      method: row.method ?? null,

      providerOrderId: row.provider_order_id,
      providerPaymentId: row.provider_payment_id ?? null,

      error: row.error_code
        ? { code: row.error_code, description: row.error_description ?? null }
        : null,

      createdAt: row.created_at,
      paidAt: row.paid_at ?? null,
      updatedAt: row.updated_at,
    };
  },

  toAdminList(rows) {
    return (rows ?? []).map((row) => PaymentMapper.toAdminDTO(row));
  },
};
