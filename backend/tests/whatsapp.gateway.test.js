// tests/whatsapp.gateway.test.js
//
// The failure taxonomy, the retry rule and the circuit breaker in
// config/whatsapp.gateway.js.
//
// `fetch` is replaced wholesale, so no real Meta traffic happens and no
// credentials are needed beyond enough to make env.whatsapp.enabled
// true. What is asserted throughout is the *number of fetches*, because
// that is the whole behaviour: one for a refusal, two for a blip, and
// none at all while the breaker is open.
//
// The most important assertions in this file are the ones that check a
// failure was NOT retried. Meta's /messages endpoint has no idempotency
// key, so re-sending a request whose outcome is unknown puts a second
// identical message on a real person's phone.
//
// Run with: npm test

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

// env.js validates at import time and whatsapp.gateway.js pulls it in,
// so the variables have to exist before the dynamic import below.
//
// `??=` for the credentials nothing here reads, and plain `=` for every
// WhatsApp one, because `npm test` loads the real .env: a developer who
// has actually configured WhatsApp would otherwise run this suite
// against their own phone number id and watch it fail on assertions
// about "/1234567890/messages". A test that only passes on an
// unconfigured machine is not testing what it claims to.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.CLOUDINARY_CLOUD_NAME ??= "test";
process.env.CLOUDINARY_API_KEY ??= "test";
process.env.CLOUDINARY_API_SECRET ??= "test";
process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

// The redirect is tested in whatsapp.testmode.test.js and must be off
// here: with it set, every assertion about `to` in this file would be
// asserting the override instead of the routing.
delete process.env.WHATSAPP_TEST_RECIPIENT;

const { WhatsAppGateway, WHATSAPP_FAILURE, WhatsAppSendError, resetWhatsAppBreaker } =
  await import("../src/config/whatsapp.gateway.js");

// ============================================================
// FAKE RESPONSES
// ============================================================

const accepted = (id = "wamid.TESTID") => ({
  ok: true,
  status: 200,
  json: async () => ({
    messaging_product: "whatsapp",
    contacts: [{ input: "919876543210", wa_id: "919876543210" }],
    messages: [{ id }],
  }),
});

/** A 2xx whose body never finished arriving. */
const truncated = () => ({
  ok: true,
  status: 200,
  json: async () => {
    throw new SyntaxError("Unexpected end of JSON input");
  },
});

/** A 2xx that parsed but carried no message id. */
const emptyOk = () => ({
  ok: true,
  status: 200,
  json: async () => ({ messaging_product: "whatsapp" }),
});

const refused = (status, code, details = "simulated") => ({
  ok: false,
  status,
  json: async () => ({
    error: {
      message: "Simulated error",
      type: "OAuthException",
      code,
      error_data: { details },
    },
  }),
});

const socketError = (code) => {
  const error = new TypeError("fetch failed");
  error.cause = { code };
  return error;
};

const timeoutError = () => {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
};

// ============================================================
// HARNESS
// ============================================================

const originalFetch = globalThis.fetch;

let calls = [];

/** Queue a script of responses; each call shifts one off. */
const scriptFetch = (...responses) => {
  calls = [];

  let index = 0;

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });

    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;

    if (next instanceof Error) throw next;

    return next;
  };
};

const send = (overrides = {}) =>
  WhatsAppGateway.sendTemplate({
    to: "+919876543210",
    name: "sb_order_confirmed",
    language: "en",
    params: ["Meera", "SB-001042", "₹2,499.00"],
    ...overrides,
  });

/** Run send() and hand back the error it threw. */
const sendExpectingFailure = async (overrides) => {
  try {
    await send(overrides);
  } catch (error) {
    return error;
  }

  assert.fail("expected sendTemplate to throw");
};

beforeEach(() => {
  resetWhatsAppBreaker();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetWhatsAppBreaker();
});

// ============================================================
// THE WIRE FORMAT
// ============================================================

describe("the request Meta receives", () => {
  it("sends a template message to the configured number id", async () => {
    scriptFetch(accepted());

    const result = await send();

    assert.equal(result.messageId, "wamid.TESTID");
    assert.equal(calls.length, 1);

    const { url, options } = calls[0];

    assert.ok(url.includes("/1234567890/messages"), url);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-access-token");

    const body = JSON.parse(options.body);

    assert.equal(body.messaging_product, "whatsapp");
    assert.equal(body.type, "template");
    assert.equal(body.template.name, "sb_order_confirmed");
    assert.equal(body.template.language.code, "en");
  });

  it("strips the leading plus from the recipient", async () => {
    // The Cloud API's documented form is bare digits. The outbox stores
    // '+' because that is what a human reads; converting is this
    // module's job and nobody else's.
    scriptFetch(accepted());

    await send({ to: "+919876543210" });

    assert.equal(JSON.parse(calls[0].options.body).to, "919876543210");
  });

  it("puts the parameters in order, as text", async () => {
    scriptFetch(accepted());

    await send();

    const body = JSON.parse(calls[0].options.body);
    const component = body.template.components[0];

    assert.equal(component.type, "body");
    assert.deepEqual(
      component.parameters,
      [
        { type: "text", text: "Meera" },
        { type: "text", text: "SB-001042" },
        { type: "text", text: "₹2,499.00" },
      ],
    );
  });

  it("omits components entirely for a template with no parameters", async () => {
    // An empty body component is rejected with 132000; leaving the key
    // off is the correct way to say "this template has no placeholders".
    scriptFetch(accepted());

    await send({ params: [] });

    const body = JSON.parse(calls[0].options.body);

    assert.equal("components" in body.template, false);
  });

  it("returns the wa_id when Meta supplies one", async () => {
    scriptFetch(accepted());

    assert.equal((await send()).waId, "919876543210");
  });
});

// ============================================================
// CLASSIFICATION
// ============================================================

describe("classification", () => {
  const cases = [
    {
      what: "131026 — not a WhatsApp user",
      response: () => refused(400, 131026),
      kind: WHATSAPP_FAILURE.REJECTED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "132001 — the template does not exist in that language",
      response: () => refused(400, 132001),
      kind: WHATSAPP_FAILURE.REJECTED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "132000 — wrong parameter count",
      response: () => refused(400, 132000),
      kind: WHATSAPP_FAILURE.REJECTED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "190 — the access token expired",
      response: () => refused(401, 190),
      kind: WHATSAPP_FAILURE.MISCONFIGURED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "133010 — the number is not registered",
      response: () => refused(400, 133010),
      kind: WHATSAPP_FAILURE.MISCONFIGURED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "130429 — rate limited",
      response: () => refused(400, 130429),
      kind: WHATSAPP_FAILURE.THROTTLED,
      retryable: true,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "HTTP 429",
      response: () => refused(429, 0),
      kind: WHATSAPP_FAILURE.THROTTLED,
      retryable: true,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "HTTP 500",
      response: () => refused(500, 0),
      kind: WHATSAPP_FAILURE.UNHEALTHY,
      retryable: true,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "an unrecognised 4xx",
      response: () => refused(418, 999999),
      kind: WHATSAPP_FAILURE.REJECTED,
      retryable: false,
      ambiguous: false,
      fetches: 1,
    },
    {
      what: "a 2xx with an unreadable body",
      response: () => truncated(),
      kind: WHATSAPP_FAILURE.UNREADABLE,
      retryable: false,
      ambiguous: true,
      fetches: 1,
    },
    {
      what: "a 2xx with no message id",
      response: () => emptyOk(),
      kind: WHATSAPP_FAILURE.UNREADABLE,
      retryable: false,
      ambiguous: true,
      fetches: 1,
    },
    {
      what: "a timeout",
      response: () => timeoutError(),
      kind: WHATSAPP_FAILURE.TIMEOUT,
      retryable: false,
      ambiguous: true,
      fetches: 1,
    },
    {
      what: "a connection broken mid-flight",
      response: () => socketError("ECONNRESET"),
      kind: WHATSAPP_FAILURE.NETWORK,
      retryable: false,
      ambiguous: true,
      fetches: 1,
    },
    {
      what: "a connection refused — provably unsent",
      response: () => socketError("ECONNREFUSED"),
      kind: WHATSAPP_FAILURE.UNSENT,
      retryable: true,
      ambiguous: false,
      fetches: 2, // the one in-process retry
    },
    {
      what: "DNS failure — provably unsent",
      response: () => socketError("ENOTFOUND"),
      kind: WHATSAPP_FAILURE.UNSENT,
      retryable: true,
      ambiguous: false,
      fetches: 2,
    },
  ];

  for (const { what, response, kind, retryable, ambiguous, fetches } of cases) {
    it(`classifies ${what}`, async () => {
      scriptFetch(response());

      const error = await sendExpectingFailure();

      assert.ok(error instanceof WhatsAppSendError);
      assert.equal(error.kind, kind);
      assert.equal(error.retryable, retryable, "retryable");
      assert.equal(error.ambiguous, ambiguous, "ambiguous");
      assert.equal(calls.length, fetches, `expected ${fetches} fetch(es)`);
    });
  }
});

// ============================================================
// THE RETRY RULE — the assertions that prevent a duplicate
// ============================================================

describe("what is never retried in process", () => {
  // Every case here could, if retried, put a second identical message
  // on a real person's phone. Meta has no idempotency key to collapse
  // them, so the count must stay at one.
  const mustNotRepeat = [
    ["a timeout", () => timeoutError()],
    ["a connection broken mid-flight", () => socketError("ECONNRESET")],
    ["a 2xx that could not be read", () => truncated()],
    ["a 2xx with no message id", () => emptyOk()],
  ];

  for (const [what, response] of mustNotRepeat) {
    it(`does not repeat after ${what}`, async () => {
      scriptFetch(response());

      const error = await sendExpectingFailure();

      assert.equal(
        calls.length,
        1,
        "an ambiguous failure must never be re-sent — Meta has no " +
          "idempotency key, so the retry is a duplicate on a real phone",
      );
      assert.equal(error.ambiguous, true);
    });
  }

  it("retries an unsent request exactly once, then gives up", async () => {
    scriptFetch(socketError("ECONNREFUSED"));

    await sendExpectingFailure();

    assert.equal(calls.length, 2);
  });

  it("succeeds on the retry when the blip clears", async () => {
    let first = true;

    calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });

      if (first) {
        first = false;
        throw socketError("ECONNREFUSED");
      }

      return accepted("wamid.SECOND");
    };

    const result = await send();

    assert.equal(result.messageId, "wamid.SECOND");
    assert.equal(calls.length, 2);
  });
});

// ============================================================
// CIRCUIT BREAKER
// ============================================================

describe("circuit breaker", () => {
  it("opens after five consecutive unwell calls and then stops dialling", async () => {
    scriptFetch(refused(500, 0));

    for (let i = 0; i < 5; i += 1) await sendExpectingFailure();

    assert.equal(calls.length, 5);

    const error = await sendExpectingFailure();

    assert.equal(calls.length, 5, "the sixth call must not dial out");
    assert.equal(error.code, "BREAKER_OPEN");
    assert.equal(error.retryable, true, "a short-circuited job should come back");
    assert.equal(error.ambiguous, false, "nothing was sent, by construction");
  });

  it("is not tripped by refusals", async () => {
    // A mistyped template name would otherwise stop every other message
    // in the shop after five orders.
    scriptFetch(refused(400, 132001));

    for (let i = 0; i < 8; i += 1) await sendExpectingFailure();

    assert.equal(calls.length, 8, "a rejection is Meta disagreeing, not Meta failing");
  });

  it("is not tripped by a misconfiguration", async () => {
    scriptFetch(refused(401, 190));

    for (let i = 0; i < 8; i += 1) await sendExpectingFailure();

    assert.equal(calls.length, 8);
  });

  it("is reset by any answer at all", async () => {
    let n = 0;

    calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      n += 1;

      // Four failures, one success, then four more: never five in a row.
      if (n === 5) return accepted();

      return refused(500, 0);
    };

    for (let i = 0; i < 4; i += 1) await sendExpectingFailure();
    await send();
    for (let i = 0; i < 4; i += 1) await sendExpectingFailure();

    assert.equal(calls.length, 9, "the breaker should never have opened");
  });
});

// ============================================================
// CONFIGURATION
// ============================================================

describe("when WhatsApp is not configured", () => {
  it("reports isEnabled from the environment", () => {
    assert.equal(WhatsAppGateway.isEnabled(), true);
  });
});
