// tests/whatsapp.testmode.test.js
//
// WHATSAPP_TEST_RECIPIENT — the redirect that stops a test run reaching
// somebody's real phone.
//
// A file of its own rather than a describe block in
// whatsapp.gateway.test.js, because env.js reads process.env once at
// import time and freezes the result. Setting the variable after that
// import would change nothing, and setting it before would put every
// other gateway test into test mode. `node --test` gives each file its
// own process, so the two cannot leak into one another.
//
// What is being protected here is not a behaviour, it is a promise: with
// this set, no number other than the one configured can be handed to
// Meta. A test that only checks the happy path would not notice the
// promise being broken by a second code path added later, so every
// assertion below reads the URL and body actually sent.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.CLOUDINARY_CLOUD_NAME ??= "test";
process.env.CLOUDINARY_API_KEY ??= "test";
process.env.CLOUDINARY_API_SECRET ??= "test";
// Plain `=`, not `??=`: `npm test` loads the real .env, and on a machine
// where WhatsApp is configured these would otherwise be that machine's
// own credentials — see the same note in whatsapp.gateway.test.js.
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

// Set deliberately in the local form a person would type, to assert the
// normalisation on the way in as well as the redirect on the way out.
process.env.WHATSAPP_TEST_RECIPIENT = "6374406703";

const { env } = await import("../src/config/env.js");
const { WhatsAppGateway, resetWhatsAppBreaker } = await import(
  "../src/config/whatsapp.gateway.js"
);

const accepted = (id = "wamid.TESTID") => ({
  ok: true,
  status: 200,
  json: async () => ({
    messaging_product: "whatsapp",
    contacts: [{ input: "916374406703", wa_id: "916374406703" }],
    messages: [{ id }],
  }),
});

const originalFetch = globalThis.fetch;

let calls = [];

const captureFetch = () => {
  calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });

    return accepted();
  };
};

/** The `to` field as Meta would have received it. */
const sentTo = () => JSON.parse(calls[0].options.body).to;

beforeEach(() => {
  resetWhatsAppBreaker();
  captureFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetWhatsAppBreaker();
});

describe("WHATSAPP_TEST_RECIPIENT", () => {
  it("normalises a locally typed number into E.164", () => {
    assert.equal(env.whatsapp.testRecipient, "+916374406703");
  });

  it("redirects a customer message away from the shopper's number", async () => {
    await WhatsAppGateway.sendTemplate({
      to: "+919876543210",
      name: "sb_order_confirmed",
      language: "en",
      params: ["Meera", "SB-001042", "₹2,499.00"],
    });

    assert.equal(sentTo(), "916374406703");
  });

  it("redirects an admin message away from the shop's number", async () => {
    await WhatsAppGateway.sendTemplate({
      to: "+918123456789",
      name: "sb_admin_new_paid_order",
      language: "en",
      params: ["SB-001042", "₹2,499.00", "3", "Meera Krishnan", "Coimbatore"],
    });

    assert.equal(sentTo(), "916374406703");
  });

  it("leaves the number alone when it is already the test recipient", async () => {
    await WhatsAppGateway.sendTemplate({
      to: "+916374406703",
      name: "sb_order_packed",
      language: "en",
      params: ["Meera", "SB-001042"],
    });

    assert.equal(sentTo(), "916374406703");
  });

  it("redirects a number that could not be normalised rather than passing it through", async () => {
    // An unroutable string should never reach this gateway — the planner
    // records it as UNUSABLE_PHONE — but if one ever did, the redirect
    // has to win. Passing it through would be a send to an address
    // nobody chose while the operator believes nothing can escape.
    await WhatsAppGateway.sendTemplate({
      to: "not-a-number",
      name: "sb_order_packed",
      language: "en",
      params: ["Meera", "SB-001042"],
    });

    assert.equal(sentTo(), "916374406703");
  });

  it("changes nothing else about the request", async () => {
    await WhatsAppGateway.sendTemplate({
      to: "+919876543210",
      name: "sb_order_shipped",
      language: "en",
      params: ["Meera", "SB-001042"],
    });

    const body = JSON.parse(calls[0].options.body);

    assert.ok(calls[0].url.includes("/1234567890/messages"));
    assert.equal(body.template.name, "sb_order_shipped");
    assert.equal(body.template.language.code, "en");
    assert.deepEqual(
      body.template.components[0].parameters.map((p) => p.text),
      ["Meera", "SB-001042"],
    );
  });
});
