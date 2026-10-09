// tests/email.test.js
//
// Order emails and password reset: which emails an event produces, what
// the templates put on the page, how a Resend failure is classified, and
// what the status-change validator demands before an order is packed.
//
// env.js reads process.env once and freezes it, so the email settings
// are fixed here, before the import — see whatsapp.testmode.test.js.

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";
// Plain `=`: `npm test` loads the real .env, and these must not be that
// machine's real Resend credentials or test redirect.
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "Shop <shop@example.test>";
process.env.ADMIN_NOTIFY_EMAIL = "Owner@Example.test, second@example.test";
process.env.STOREFRONT_URL = "https://shop.example.test/";
process.env.EMAIL_TEST_RECIPIENT = "";

const { env } = await import("../src/config/env.js");
const { EmailGateway, EmailSendError } = await import("../src/config/email.gateway.js");
const { EMAIL_KIND, EMAIL_STATUS, emailDedupeKey, emailsForEvent } = await import(
  "../src/config/email.policy.js"
);
const { NOTIFY_EVENT } = await import("../src/config/whatsapp.policy.js");
const templates = await import("../src/emails/templates.js");
const { EmailService } = await import("../src/services/email.service.js");
const { EmailRepository } = await import("../src/repository/email.repository.js");
const { validateStatusChange } = await import("../src/validators/order.validator.js");

const ORDER = Object.freeze({
  id: "7b6d1c2e-1111-4a4a-8888-000000000001",
  order_number: "SB-1042",
  contact_name: "Meera <b>Iyer</b>",
  contact_email: "Meera@Example.test",
  contact_phone: "+919876543210",
  shipping_line1: "12 Lake Road",
  shipping_line2: null,
  shipping_landmark: null,
  shipping_city: "Chennai",
  shipping_state: "Tamil Nadu",
  shipping_postal_code: "600001",
  shipping_country: "India",
  subtotal: "2400.00",
  shipping_fee: "0.00",
  total: "2400.00",
  currency: "INR",
  customer_note: null,
  courier_name: "Delhivery",
  tracking_number: "DLV123456",
  tracking_url: "https://track.example.test/DLV123456",
  items: [
    {
      product_name: "Rose Anarkali <script>alert(1)</script>",
      size: "M",
      unit_price: "1200.00",
      quantity: 2,
      line_total: "2400.00",
    },
  ],
});

// ============================================================
// ENV
// ============================================================

describe("email env", () => {
  it("lower-cases and splits the admin recipients", () => {
    assert.deepEqual([...env.email.adminRecipients], ["owner@example.test", "second@example.test"]);
  });

  it("keeps the storefront as a bare origin, for building links", () => {
    assert.equal(env.email.storefrontUrl, "https://shop.example.test");
  });
});

// ============================================================
// POLICY
// ============================================================

describe("emailsForEvent", () => {
  it("sends the shopper a confirmation and the shop an alert when an order is paid", () => {
    assert.deepEqual(
      emailsForEvent(NOTIFY_EVENT.ORDER_PAID).map((e) => e.kind),
      [EMAIL_KIND.ORDER_CONFIRMED, EMAIL_KIND.ADMIN_NEW_ORDER],
    );
  });

  it("sends the shopper the tracking email when an order is packed", () => {
    assert.deepEqual(
      emailsForEvent(NOTIFY_EVENT.ORDER_PACKED).map((e) => e.kind),
      [EMAIL_KIND.ORDER_PACKED],
    );
  });

  it("sends nothing for shipped, delivered or cancelled", () => {
    for (const event of [NOTIFY_EVENT.ORDER_SHIPPED, NOTIFY_EVENT.ORDER_DELIVERED, NOTIFY_EVENT.ORDER_CANCELLED]) {
      assert.deepEqual(emailsForEvent(event), []);
    }
  });

  it("builds a case-insensitive dedupe key", () => {
    assert.equal(
      emailDedupeKey({ orderId: "o1", kind: "order_packed", toEmail: "A@B.test" }),
      "o1.order_packed.a@b.test",
    );
  });
});

// ============================================================
// EMIT
// ============================================================

describe("EmailService.emitTx", () => {
  afterEach(() => mock.restoreAll());

  const fakeClient = () => {
    const statements = [];
    return { statements, query: async (sql) => { statements.push(sql); return { rows: [] }; } };
  };

  it("plans one customer row and one row per admin for a paid order", async () => {
    let planned = null;
    mock.method(EmailRepository, "emitTx", async (_client, rows) => {
      planned = rows;
      return rows.map((_, i) => `id-${i}`);
    });

    const client = fakeClient();
    const ids = await EmailService.emitTx(client, ORDER, NOTIFY_EVENT.ORDER_PAID);

    assert.deepEqual(ids, ["id-0", "id-1", "id-2"]);
    assert.deepEqual(
      planned.map((r) => [r.kind, r.toEmail, r.status]),
      [
        [EMAIL_KIND.ORDER_CONFIRMED, "meera@example.test", EMAIL_STATUS.PENDING],
        [EMAIL_KIND.ADMIN_NEW_ORDER, "owner@example.test", EMAIL_STATUS.PENDING],
        [EMAIL_KIND.ADMIN_NEW_ORDER, "second@example.test", EMAIL_STATUS.PENDING],
      ],
    );
    assert.ok(client.statements.includes("RELEASE SAVEPOINT email_notify"));
  });

  it("never throws, and rolls back only its own savepoint, when the insert fails", async () => {
    mock.method(EmailRepository, "emitTx", async () => {
      throw new Error("constraint violated");
    });

    const client = fakeClient();
    const ids = await EmailService.emitTx(client, ORDER, NOTIFY_EVENT.ORDER_PAID);

    assert.deepEqual(ids, []);
    assert.ok(client.statements.includes("ROLLBACK TO SAVEPOINT email_notify"));
  });

  it("does not touch the transaction for an event with no emails", async () => {
    const client = fakeClient();
    assert.deepEqual(await EmailService.emitTx(client, ORDER, NOTIFY_EVENT.ORDER_SHIPPED), []);
    assert.equal(client.statements.length, 0);
  });
});

// ============================================================
// TEMPLATES
// ============================================================

describe("templates", () => {
  it("escapes everything a person typed", () => {
    const { html } = templates.orderConfirmedEmail(ORDER);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<b>Iyer</b>"));
  });

  it("puts the order number and total in the confirmation", () => {
    const { subject, text } = templates.orderConfirmedEmail(ORDER);
    assert.equal(subject, "Order confirmed — SB-1042");
    assert.match(text, /₹2,400\.00/);
    assert.match(text, /https:\/\/shop\.example\.test\/track/);
  });

  it("puts the courier, tracking number and link in the packed email", () => {
    const { html, text } = templates.orderPackedEmail(ORDER);
    assert.match(text, /Courier: Delhivery/);
    assert.match(text, /Tracking number: DLV123456/);
    assert.ok(html.includes('href="https://track.example.test/DLV123456"'));
  });

  it("never puts a non-http tracking link in an href", () => {
    const { html } = templates.orderPackedEmail({ ...ORDER, tracking_url: "javascript:alert(1)" });
    assert.ok(!html.includes("javascript:"));
  });

  it("links the admin alert to the order in the admin panel", () => {
    const { text, subject } = templates.adminNewOrderEmail(ORDER);
    assert.match(subject, /^New order SB-1042/);
    assert.match(text, new RegExp(`/admin/orders/${ORDER.id}`));
    assert.match(text, /\+919876543210/);
  });

  it("puts the reset link and its expiry in the reset email", () => {
    const resetUrl = "https://shop.example.test/reset-password?token=abc";
    const { html, text } = templates.passwordResetEmail({ name: "Meera", resetUrl, ttlMinutes: 30 });
    assert.ok(text.includes(resetUrl));
    assert.match(text, /30 minutes/);
    assert.ok(html.includes("reset-password?token=abc"));
  });
});

// ============================================================
// GATEWAY
// ============================================================

describe("EmailGateway.send", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const respond = (status, body) => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    return calls;
  };

  const send = () =>
    EmailGateway.send({ to: "a@b.test", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "k-1" });

  it("posts to Resend with the key, the sender and the idempotency key", async () => {
    const calls = respond(200, { id: "email_123" });

    assert.deepEqual(await send(), { id: "email_123" });

    const { url, init } = calls[0];
    const body = JSON.parse(init.body);
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init.headers.Authorization, "Bearer re_test_key");
    assert.equal(init.headers["Idempotency-Key"], "k-1");
    assert.equal(body.from, "Shop <shop@example.test>");
    assert.deepEqual(body.to, ["a@b.test"]);
  });

  for (const [status, retryable, misconfigured] of [
    [429, true, false],
    [500, true, false],
    [401, false, true],
    [403, false, true],
    [422, false, false],
  ]) {
    it(`classifies HTTP ${status} as ${retryable ? "retryable" : "final"}`, async () => {
      respond(status, { name: "some_error", message: "nope" });

      await assert.rejects(send(), (error) => {
        assert.ok(error instanceof EmailSendError);
        assert.equal(error.retryable, retryable);
        assert.equal(error.misconfigured, misconfigured);
        return true;
      });
    });
  }

  it("treats a network failure as retryable — the idempotency key makes it safe", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    await assert.rejects(send(), (error) => error instanceof EmailSendError && error.retryable === true);
  });
});

// ============================================================
// STATUS CHANGE VALIDATOR
// ============================================================

describe("validateStatusChange — shipment", () => {
  const run = (body) => {
    const req = { body: { ...body } };
    let nextCalled = false;
    validateStatusChange(req, {}, () => {
      nextCalled = true;
    });
    return { req, nextCalled };
  };

  it("refuses to mark packed without a courier and tracking number", () => {
    assert.throws(
      () => run({ status: "packed" }),
      (error) => {
        assert.equal(error.statusCode ?? error.status, 400);
        assert.ok(error.errors?.courierName);
        assert.ok(error.errors?.trackingNumber);
        return true;
      },
    );
  });

  it("builds the shipment when marking packed", () => {
    const { req, nextCalled } = run({
      status: "packed",
      courierName: " Delhivery ",
      trackingNumber: " DLV1 ",
      trackingUrl: "https://track.example.test/DLV1",
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.body.shipment, {
      courierName: "Delhivery",
      trackingNumber: "DLV1",
      trackingUrl: "https://track.example.test/DLV1",
    });
  });

  it("refuses a tracking link that is not a web address", () => {
    assert.throws(() =>
      run({ status: "packed", courierName: "X", trackingNumber: "1", trackingUrl: "javascript:alert(1)" }),
    );
  });

  it("ignores shipment fields for any other status", () => {
    const { req, nextCalled } = run({ status: "shipped", courierName: "X", trackingNumber: "1" });
    assert.equal(nextCalled, true);
    assert.equal(req.body.shipment, null);
  });
});
