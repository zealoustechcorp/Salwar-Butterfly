// src/emails/templates.js
//
// Every email this shop sends, as { subject, html, text }.
//
// Plain functions over a raw `orders` row (snake_case, with `items` as
// SELECT_ORDER aggregates them) rather than a template engine: four
// emails do not need one, and a function is the easiest thing to test.
//
// The HTML is table-based with inline styles because that is what email
// clients render reliably — Gmail strips <style> blocks in some views
// and Outlook ignores most of modern CSS.
//
// Colours and type follow Docs/Design_Brand-Palette-and-Typography.md:
// cream ground, blush surfaces, burgundy headings and buttons, rose gold
// for hairlines and ornaments only (never text), Cormorant Garamond for
// headings and Karla for body. The web fonts load in clients that allow
// them (Apple Mail, iOS); everywhere else the documented fallbacks apply.
//
// Every value that came from a person — a name, an address, a product
// name, a courier — goes through `esc`. A product called
// `<script>` must arrive as text.

import { env } from "../config/env.js";
import { formatMoney } from "../config/whatsapp.policy.js";

const BRAND = "Salwar Butterfly";

/** The palette, by role. Text-safe pairs only — see the design doc. */
const C = Object.freeze({
  bg: "#FDF7F1", // sb-bg — cream page ground
  card: "#FFFFFF",
  surface: "#EBCBC0", // sb-surface — blush
  surfaceSoft: "#F6E6DF", // blush on cream, for quiet panels
  text: "#3E1A18", // sb-text
  heading: "#64252E", // sb-heading / sb-btn-primary
  muted: "#58321C", // sb-text-muted
  link: "#8A2E4B", // sb-link / sb-btn-rose
  goldText: "#7A4527", // sb-gold-text — captions
  gold: "#BC8A69", // sb-gold — hairlines and ornaments, never text
});

const FONT_DISPLAY = "'Cormorant Garamond','Palatino Linotype',Palatino,Georgia,serif";
const FONT_BODY = "Karla,'Segoe UI',system-ui,-apple-system,Arial,sans-serif";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Only http(s) links are ever put in an href. */
const safeUrl = (value) => {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

const money = (amount, currency) => formatMoney(amount, currency || "INR");

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] || "there";

const items = (order) => (Array.isArray(order.items) ? order.items : []);

const unitsOf = (order) => items(order).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const addressLines = (order) =>
  [
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_landmark,
    [order.shipping_city, order.shipping_state].filter(Boolean).join(", "),
    [order.shipping_postal_code, order.shipping_country].filter(Boolean).join(" "),
  ].filter((line) => line && String(line).trim());

// ============================================================
// LAYOUT
// ============================================================

/**
 * The frame every email shares: a small logo in the top-left corner and
 * one card with a blush heading band. No footer.
 *
 * Square corners throughout, deliberately. A rounded card around a
 * coloured band leaves white wedges in the corners in Gmail and Outlook,
 * which honour border-radius unevenly and ignore overflow:hidden. Only
 * the buttons are rounded, because a button is a single element and has
 * nothing behind it to show through.
 *
 * @param {object} opts
 * @param {string} opts.preheader  the grey line inboxes show after the subject
 * @param {string} opts.title      the <title>, for clients that show it
 * @param {string} opts.eyebrow    small caps label above the heading
 * @param {string} opts.heading    the heading in the blush band
 * @param {string} opts.body       the card's HTML, already escaped
 */
function layout({ preheader, title, eyebrow, heading, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Karla:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<span style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${C.bg};">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

<!-- Logo, small, top-left. Its own ground is the same cream as this
     page, so it sits without a visible box. The alt text is styled so a
     client that blocks images still shows the name in the brand colour. -->
<tr><td align="left" style="padding:0 0 14px;">
<a href="${esc(env.email.storefrontUrl)}" style="text-decoration:none;">
<img src="${esc(env.email.logoUrl)}" width="64" height="64" alt="${BRAND}" style="display:block;width:64px;height:64px;border:0;outline:none;font-family:${FONT_DISPLAY};font-size:18px;font-weight:600;color:${C.heading};">
</a>
</td></tr>

<!-- Card -->
<tr><td style="background:${C.card};border:1px solid ${C.gold};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background:${C.surface};padding:24px 30px 20px;">
<div style="font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${C.goldText};">${esc(eyebrow)}</div>
<h1 style="margin:8px 0 0;font-family:${FONT_DISPLAY};font-size:30px;line-height:1.2;font-weight:600;color:${C.heading};">${esc(heading)}</h1>
</td></tr>
<tr><td style="padding:26px 30px 30px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${C.text};">
${body}
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ============================================================
// BUILDING BLOCKS
// ============================================================

const p = (html, style = "") => `<p style="margin:0 0 14px;${style}">${html}</p>`;

const small = (html) => p(html, `font-size:13px;color:${C.muted};`);

const button = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 18px;"><tr><td style="border-radius:999px;background:${C.heading};">
<a href="${esc(href)}" style="display:inline-block;padding:13px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:700;color:${C.bg};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;

const sectionTitle = (text) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 10px;"><tr>
<td style="font-family:${FONT_BODY};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.goldText};white-space:nowrap;padding-right:12px;">${esc(text)}</td>
<td width="100%" style="border-top:1px solid ${C.surface};font-size:0;line-height:0;">&nbsp;</td>
</tr></table>`;

/** A quiet blush panel, for the block the email is really about. */
const panel = (html) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surfaceSoft};border-left:3px solid ${C.gold};"><tr><td style="padding:16px 18px;">${html}</td></tr></table>`;

/** Label / value pairs, two columns. */
const facts = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT_BODY};">${rows
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(
      ([label, value]) =>
        `<tr><td style="padding:5px 0;font-size:13px;color:${C.muted};">${esc(label)}</td><td align="right" style="padding:5px 0;font-size:15px;font-weight:700;color:${C.text};word-break:break-all;">${esc(value)}</td></tr>`,
    )
    .join("")}</table>`;

function itemsTable(order) {
  const rows = items(order)
    .map(
      (item) => `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${C.surfaceSoft};">
<div style="font-family:${FONT_DISPLAY};font-size:18px;font-weight:600;line-height:1.3;color:${C.heading};">${esc(item.product_name)}</div>
<div style="padding-top:3px;font-size:13px;color:${C.muted};">${item.size ? `Size ${esc(item.size)} &nbsp;·&nbsp; ` : ""}Qty ${esc(item.quantity)} &nbsp;·&nbsp; ${esc(money(item.unit_price, order.currency))} each</div>
</td>
<td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.surfaceSoft};white-space:nowrap;vertical-align:top;font-weight:700;color:${C.text};">${esc(money(item.line_total, order.currency))}</td>
</tr>`,
    )
    .join("");

  const shipping = Number(order.shipping_fee) > 0 ? money(order.shipping_fee, order.currency) : "Free";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT_BODY};font-size:14px;">
${rows}
<tr><td style="padding:12px 0 3px;color:${C.muted};">Subtotal</td><td align="right" style="padding:12px 0 3px;color:${C.text};">${esc(money(order.subtotal, order.currency))}</td></tr>
<tr><td style="padding:3px 0 12px;color:${C.muted};">Delivery</td><td align="right" style="padding:3px 0 12px;color:${C.text};">${esc(shipping)}</td></tr>
<tr><td style="padding:12px 0 0;border-top:1px solid ${C.gold};font-family:${FONT_DISPLAY};font-size:20px;font-weight:600;color:${C.heading};">Total</td><td align="right" style="padding:12px 0 0;border-top:1px solid ${C.gold};font-family:${FONT_DISPLAY};font-size:20px;font-weight:600;color:${C.heading};">${esc(money(order.total, order.currency))}</td></tr>
</table>`;
}

const addressBlock = (order) =>
  `<p style="margin:0;font-size:14px;line-height:1.7;color:${C.text};"><strong>${esc(order.contact_name)}</strong><br>${addressLines(order)
    .map(esc)
    .join("<br>")}<br><span style="color:${C.muted};">${esc(order.contact_phone)}</span></p>`;

const itemsText = (order) =>
  items(order)
    .map(
      (item) =>
        `- ${item.product_name}${item.size ? ` (size ${item.size})` : ""} x${item.quantity} — ${money(item.line_total, order.currency)}`,
    )
    .join("\n");

const trackUrl = () => `${env.email.storefrontUrl}/track`;

// ============================================================
// CUSTOMER: ORDER CONFIRMED
// ============================================================

export function orderConfirmedEmail(order) {
  const subject = `Order confirmed — ${order.order_number}`;

  const body = [
    p(`Hi ${esc(firstName(order.contact_name))},`),
    p(`Thank you for shopping with us. We have received your payment and your order <strong style="color:${C.heading};">${esc(order.order_number)}</strong> is confirmed — we are getting your pieces ready.`),
    sectionTitle("Your order"),
    itemsTable(order),
    sectionTitle("Delivering to"),
    addressBlock(order),
    button(trackUrl(), "Track your order"),
    small(`To track it, use your order number <strong>${esc(order.order_number)}</strong> and this email address.`),
  ].join("\n");

  const text = [
    `Hi ${firstName(order.contact_name)},`,
    "",
    `We have received your payment and your order ${order.order_number} is confirmed.`,
    "",
    itemsText(order),
    `Total: ${money(order.total, order.currency)}`,
    "",
    "Delivering to:",
    [order.contact_name, ...addressLines(order), order.contact_phone].join("\n"),
    "",
    `Track your order: ${trackUrl()}`,
    "",
    `— ${BRAND}`,
  ].join("\n");

  return {
    subject,
    html: layout({
      preheader: `Your order ${order.order_number} is confirmed. We are getting your pieces ready.`,
      title: subject,
      eyebrow: `Order ${order.order_number}`,
      heading: "Thank you for your order",
      body,
    }),
    text,
  };
}

// ============================================================
// CUSTOMER: ORDER PACKED (with tracking)
// ============================================================

export function orderPackedEmail(order) {
  const subject = `Your order is packed — ${order.order_number}`;
  const link = safeUrl(order.tracking_url);

  const body = [
    p(`Hi ${esc(firstName(order.contact_name))},`),
    p(`Good news — your order <strong style="color:${C.heading};">${esc(order.order_number)}</strong> is packed and handed over for delivery.`),
    sectionTitle("Tracking details"),
    panel(
      facts([
        ["Courier", order.courier_name],
        ["Tracking number", order.tracking_number],
      ]),
    ),
    link
      ? button(link, "Track your parcel")
      : small(`<span style="display:block;padding-top:12px;">Use the tracking number on the courier's website to follow your parcel.</span>`),
    sectionTitle("What is in the parcel"),
    itemsTable(order),
    sectionTitle("Delivering to"),
    addressBlock(order),
  ].join("\n");

  const text = [
    `Hi ${firstName(order.contact_name)},`,
    "",
    `Your order ${order.order_number} is packed and handed over for delivery.`,
    "",
    order.courier_name ? `Courier: ${order.courier_name}` : null,
    order.tracking_number ? `Tracking number: ${order.tracking_number}` : null,
    link ? `Track your parcel: ${link}` : null,
    "",
    itemsText(order),
    "",
    `— ${BRAND}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject,
    html: layout({
      preheader: order.tracking_number
        ? `${order.courier_name ? `${order.courier_name} · ` : ""}Tracking number ${order.tracking_number}`
        : `Your order ${order.order_number} is on its way.`,
      title: subject,
      eyebrow: `Order ${order.order_number}`,
      heading: "Your order is on its way",
      body,
    }),
    text,
  };
}

// ============================================================
// ADMIN: NEW ORDER
// ============================================================

export function adminNewOrderEmail(order) {
  const units = unitsOf(order);
  const subject = `New order ${order.order_number} — ${money(order.total, order.currency)} from ${order.contact_name}`;
  const adminUrl = `${env.email.storefrontUrl}/admin/orders/${order.id}`;

  const tile = (label, value) =>
    `<td width="33%" align="center" style="padding:14px 6px;background:${C.surfaceSoft};">
<div style="font-family:${FONT_DISPLAY};font-size:22px;font-weight:600;line-height:1.2;color:${C.heading};">${esc(value)}</div>
<div style="padding-top:4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.goldText};">${esc(label)}</div>
</td>`;

  const body = [
    p(`<strong>${esc(order.contact_name)}</strong> just paid for order <strong style="color:${C.heading};">${esc(order.order_number)}</strong>. It is in the pack queue.`),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;border-collapse:separate;border-spacing:6px 0;"><tr>
${tile("Total", money(order.total, order.currency))}
${tile(units === 1 ? "Piece" : "Pieces", String(units))}
${tile("Payment", "Paid")}
</tr></table>`,
    sectionTitle("Ordered"),
    itemsTable(order),
    sectionTitle("Customer"),
    `<p style="margin:0;font-size:14px;line-height:1.7;"><strong>${esc(order.contact_name)}</strong><br><a href="mailto:${esc(order.contact_email)}" style="color:${C.link};">${esc(order.contact_email)}</a><br><a href="tel:${esc(order.contact_phone)}" style="color:${C.link};">${esc(order.contact_phone)}</a></p>`,
    sectionTitle("Ship to"),
    addressBlock(order),
    order.customer_note
      ? sectionTitle("Note from the customer") + panel(`<div style="font-size:14px;font-style:italic;color:${C.text};">${esc(order.customer_note).replace(/\n/g, "<br>")}</div>`)
      : "",
    button(adminUrl, "Open in admin"),
  ].join("\n");

  const text = [
    `New order ${order.order_number} — ${money(order.total, order.currency)}`,
    "",
    itemsText(order),
    "",
    `Customer: ${order.contact_name}, ${order.contact_email}, ${order.contact_phone}`,
    "Ship to:",
    addressLines(order).join("\n"),
    order.customer_note ? `\nNote: ${order.customer_note}` : null,
    "",
    `Open in admin: ${adminUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    subject,
    html: layout({
      preheader: `${units} ${units === 1 ? "piece" : "pieces"}, ${money(order.total, order.currency)} — ${order.contact_name}`,
      title: subject,
      eyebrow: "New order · paid",
      heading: `${order.order_number} · ${money(order.total, order.currency)}`,
      body,
    }),
    text,
  };
}

// ============================================================
// CUSTOMER: PASSWORD RESET
// ============================================================

export function passwordResetEmail({ name, resetUrl, ttlMinutes }) {
  const subject = "Reset your Salwar Butterfly password";

  const body = [
    p(`Hi ${esc(firstName(name))},`),
    p(`We received a request to reset the password for your Salwar Butterfly account. Tap the button below to choose a new one.`),
    button(resetUrl, "Choose a new password"),
    panel(
      `<div style="font-size:14px;color:${C.text};">This link works <strong>once</strong> and expires in <strong>${esc(ttlMinutes)} minutes</strong>.</div>`,
    ),
    `<div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>`,
    small(`If you did not ask for this, you can safely ignore this email — your password will not change.`),
    small(`<span style="word-break:break-all;">If the button does not work, paste this link into your browser:<br><a href="${esc(resetUrl)}" style="color:${C.link};">${esc(resetUrl)}</a></span>`),
  ].join("\n");

  const text = [
    `Hi ${firstName(name)},`,
    "",
    "We received a request to reset the password for your account. Choose a new one here:",
    resetUrl,
    "",
    `This link works once and expires in ${ttlMinutes} minutes.`,
    "If you did not ask for this, you can ignore this email — your password will not change.",
    "",
    `— ${BRAND}`,
  ].join("\n");

  return {
    subject,
    html: layout({
      preheader: `Use this link to choose a new password. It expires in ${ttlMinutes} minutes.`,
      title: subject,
      eyebrow: "Account",
      heading: "Reset your password",
      body,
    }),
    text,
  };
}
