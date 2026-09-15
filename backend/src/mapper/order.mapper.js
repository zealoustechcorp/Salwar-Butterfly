// src/mapper/order.mapper.js

import { ORDER_STATUS, ORDER_STATUSES } from "../config/order.policy.js";

/**
 * Money out of Postgres.
 *
 * The pg driver hands back DECIMAL as a string, on purpose — a NUMERIC
 * can hold more precision than a JavaScript number. Rupees at two places
 * cannot, so converting here is safe and leaving it as a string is not:
 * `"1200.00" + 50` is `"1200.0050"` in the client that forgets.
 */
const toMoney = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * One line of an order.
 *
 * The snapshot fields come first and the live ids after, because that is
 * the order of trust: `productName` is what was bought, `productId` is
 * only a link to what the catalogue currently calls it, and may be null
 * for a product since deleted.
 */
const toItemDTO = (item) => ({
  id: item.id,

  productName: item.product_name,
  size: item.size ?? null,
  imageUrl: item.image_url ?? null,
  unitPrice: toMoney(item.unit_price),
  quantity: Number(item.quantity),
  lineTotal: toMoney(item.line_total),

  // Null once the underlying row is deleted. A client should render the
  // line either way and only link when there is something to link to.
  productId: item.product_id ?? null,
  variantId: item.variant_id ?? null,
  productSlug: item.product_slug ?? null,
});

export const OrderMapper = {
  /**
   * The full order, for the admin panel and for its own customer.
   *
   * Address and contact are nested rather than flattened, so a client
   * can pass `order.shippingAddress` straight to an address block
   * instead of unpicking ten `shipping`-prefixed keys — the same shape
   * InventoryMapper uses for its product context.
   */
  toDTO(row) {
    if (!row) return null;

    const items = Array.isArray(row.items) ? row.items : [];

    return {
      id: row.id,
      orderNumber: row.order_number,

      status: row.status,
      paymentStatus: row.payment_status,

      // Null for a guest checkout. Its presence is what an "is this
      // mine?" check on the storefront reads.
      customerId: row.customer_id ?? null,

      contact: {
        name: row.contact_name,
        email: row.contact_email,
        phone: row.contact_phone,
      },

      shippingAddress: {
        line1: row.shipping_line1,
        line2: row.shipping_line2 ?? null,
        landmark: row.shipping_landmark ?? null,
        city: row.shipping_city,
        state: row.shipping_state,
        postalCode: row.shipping_postal_code,
        country: row.shipping_country,
      },

      items: items.map((item) => toItemDTO(item)),

      // Counts, so a summary line does not have to walk the items to
      // say "3 pieces across 2 styles".
      itemCount: items.length,
      unitCount: items.reduce((sum, item) => sum + Number(item.quantity), 0),

      subtotal: toMoney(row.subtotal),
      shippingFee: toMoney(row.shipping_fee),
      total: toMoney(row.total),
      currency: row.currency,

      customerNote: row.customer_note ?? null,

      // Carried on both DTOs, deliberately. For the shop it answers "why
      // was nothing sent to this shopper", which the notification strip
      // on the order page would otherwise have to guess at. For the
      // shopper it is simply their own answer to a question they were
      // asked at checkout, which is theirs to see.
      whatsappOptIn: row.whatsapp_opt_in ?? null,

      timeline: {
        placedAt: row.placed_at,
        paidAt: row.paid_at ?? null,
        packedAt: row.packed_at ?? null,
        shippedAt: row.shipped_at ?? null,
        deliveredAt: row.delivered_at ?? null,
        cancelledAt: row.cancelled_at ?? null,
      },

      cancellationReason: row.cancellation_reason ?? null,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  toDTOList(rows = []) {
    return rows.map((row) => OrderMapper.toDTO(row));
  },

  /**
   * The same order, with everything only the shop should see removed.
   *
   * A subtractive step over toDTO rather than a second hand-written
   * shape: a field added to an order is then visible to the admin
   * immediately and to the storefront only when somebody decides it
   * should be, which is the safe direction for the mistake to fall.
   *
   * `adminNote` is never mapped at all, in either direction — it is the
   * shop talking to itself.
   */
  toCustomerDTO(row) {
    const dto = OrderMapper.toDTO(row);
    if (!dto) return null;

    // The shopper knows their own email; echoing it is harmless. What
    // does not belong on a storefront response is the customer id of the
    // account the order is attached to, which is only ever used to look
    // other things up.
    const { customerId, ...rest } = dto;

    return rest;
  },

  toCustomerDTOList(rows = []) {
    return rows.map((row) => OrderMapper.toCustomerDTO(row));
  },

  /**
   * Counts and revenue per status, for the admin queue's tiles.
   *
   * Every status is present whether or not any order is in it — a tile
   * that vanishes when it reaches zero is a tile the admin has to
   * notice the absence of.
   *
   * Revenue counts what was actually taken: cancelled orders are
   * excluded, and so are unpaid ones. An order sitting in
   * pending_payment is a hope, not a sale, and adding it to a revenue
   * figure overstates the day.
   */
  toSummary(rows = []) {
    const byStatus = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, { orders: 0, revenue: 0 }]),
    );

    let totalOrders = 0;
    let paidRevenue = 0;

    for (const row of rows) {
      const bucket = byStatus[row.status];
      if (!bucket) continue;

      bucket.orders = Number(row.order_count) || 0;
      bucket.revenue = toMoney(row.revenue) ?? 0;

      totalOrders += bucket.orders;

      if (
        row.status !== ORDER_STATUS.CANCELLED &&
        row.status !== ORDER_STATUS.PENDING_PAYMENT
      ) {
        paidRevenue += bucket.revenue;
      }
    }

    return {
      totalOrders,

      /** Placed and paid for, cancellations excluded. */
      paidRevenue: Math.round(paidRevenue * 100) / 100,

      /** What the shop has to act on right now. */
      awaitingPayment: byStatus[ORDER_STATUS.PENDING_PAYMENT].orders,
      toPack: byStatus[ORDER_STATUS.CONFIRMED].orders,
      toShip: byStatus[ORDER_STATUS.PACKED].orders,
      inTransit: byStatus[ORDER_STATUS.SHIPPED].orders,

      byStatus,
    };
  },
};
