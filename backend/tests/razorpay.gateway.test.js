// tests/razorpay.gateway.test.js
//
// The retry policy and the circuit breaker in razorpay.gateway.js.
//
// `fetch` is replaced wholesale, so no real Razorpay traffic happens and
// no keys are needed beyond enough of a pair to make `env.razorpay.enabled`
// true. What is asserted throughout is the *number of fetches*, because
// that is the whole behaviour: one for a refusal, two for a blip, none at
// all while the breaker is open.
//
// Run with: npm test

import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// env.js validates at import time and razorpay.gateway.js pulls it in, so
// the variables have to exist before the dynamic import below.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";
process.env.RAZORPAY_KEY_ID ??= "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET ??= "rzp_test_secret";

const { RazorpayGateway, resetGatewayBreaker } = await import(
  "../src/config/razorpay.gateway.js"
);

// ============================================================
// FAKE RESPONSES
// ============================================================

const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });

const failed = (status, code = "BAD_REQUEST_ERROR") => ({
  ok: false,
  status,
  json: async () => ({ error: { code, description: `simulated ${status}` } }),
});

/**
 * A 2xx whose body never finished arriving.
 *
 * AbortSignal.timeout covers the body stream as well as the headers, so
 * a gateway that answers quickly and then sends slowly produces exactly
 * this: an `ok` response whose `json()` rejects.
 */
const unreadable = () => ({
  ok: true,
  status: 200,
  json: async () => {
    throw new SyntaxError("Unexpected end of JSON input");
  },
});

/** What undici throws when the connection never opened. */
const connectionRefused = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
  });

/** What AbortSignal.timeout produces once GATEWAY_TIMEOUT_MS is up. */
const timeout = () => Object.assign(new Error("The operation was aborted"), {
  name: "TimeoutError",
});

/**
 * Installs a fetch that plays the given script, one entry per call.
 *
 * An entry is either a response object (resolved) or an Error (rejected).
 * The last entry repeats, so a test that needs "always fails" passes one.
 */
const scriptFetch = (...script) => {
  let index = 0;

  const fake = mock.fn(async () => {
    const step = script[Math.min(index, script.length - 1)];
    index += 1;

    if (step instanceof Error) throw step;

    return step;
  });

  globalThis.fetch = fake;

  return fake;
};

const ORDER = { amount: 1850, currency: "INR", receipt: "SB-000123" };

const createdOrder = ok({ id: "order_test_1", amount: 185_000 });

// ============================================================

describe("RazorpayGateway", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    resetGatewayBreaker();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    mock.timers.reset();
    mock.restoreAll();
  });

  // ----------------------------------------------------------
  // RETRIES
  // ----------------------------------------------------------

  describe("retries", () => {
    it("retries a GET past a network blip and returns the success payload", async () => {
      const fetchMock = scriptFetch(connectionRefused(), ok({ id: "pay_1", amount: 185_000 }));

      const payment = await RazorpayGateway.fetchPayment("pay_1");

      assert.equal(fetchMock.mock.callCount(), 2);
      assert.equal(payment.id, "pay_1");
    });

    it("retries a GET past a timeout", async () => {
      const fetchMock = scriptFetch(timeout(), ok({ id: "pay_2" }));

      const payment = await RazorpayGateway.fetchPayment("pay_2");

      assert.equal(fetchMock.mock.callCount(), 2);
      assert.equal(payment.id, "pay_2");
    });

    it("gives up after three attempts and reports the timeout", async () => {
      const fetchMock = scriptFetch(timeout());

      await assert.rejects(RazorpayGateway.fetchPayment("pay_3"), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_TIMEOUT");
        assert.equal(error.statusCode, 504);
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 3);
    });

    it("does not retry a 400 — a refusal is a decision, not a failure", async () => {
      const fetchMock = scriptFetch(failed(400));

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_REJECTED");
        assert.equal(error.statusCode, 502);
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("does not retry a 401 — retrying cannot fix the keys", async () => {
      const fetchMock = scriptFetch(failed(401, "BAD_REQUEST_ERROR"));

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_CREDENTIALS_REJECTED");
        assert.equal(error.statusCode, 503);
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("retries a GET on a 429", async () => {
      const fetchMock = scriptFetch(failed(429, "TOO_MANY_REQUESTS"), ok({ id: "pay_4" }));

      await RazorpayGateway.fetchPayment("pay_4");

      assert.equal(fetchMock.mock.callCount(), 2);
    });

    it("retries a GET on a 500", async () => {
      const fetchMock = scriptFetch(failed(500, "SERVER_ERROR"), ok({ id: "pay_5" }));

      await RazorpayGateway.fetchPayment("pay_5");

      assert.equal(fetchMock.mock.callCount(), 2);
    });

    it("retries a GET whose 200 arrived with an unreadable body", async () => {
      const fetchMock = scriptFetch(unreadable(), ok({ id: "pay_6", status: "captured" }));

      const payment = await RazorpayGateway.fetchPayment("pay_6");

      assert.equal(fetchMock.mock.callCount(), 2);
      assert.equal(payment.status, "captured");
    });

    it("reports an unreadable 200 rather than passing null up", async () => {
      // The case this exists for: `null` reaching payment.service.js reads
      // as "not captured", which marks a paid shopper's attempt FAILED.
      // A 502 leaves the verdict unwritten for the webhook to settle.
      const fetchMock = scriptFetch(unreadable());

      await assert.rejects(RazorpayGateway.fetchPayment("pay_7"), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_MALFORMED");
        assert.equal(error.statusCode, 502);
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 3);
    });
  });

  // ----------------------------------------------------------
  // POST SAFETY
  // ----------------------------------------------------------
  //
  // The half of the policy that protects the shopper's card rather than
  // their patience. Until the idempotency key of Hardening item 3 is
  // being sent, a POST that may have arrived must never be replayed —
  // the duplicate would be a second Razorpay order for one basket.

  describe("POST safety", () => {
    it("retries a POST when the connection never opened", async () => {
      const fetchMock = scriptFetch(connectionRefused(), createdOrder);

      const order = await RazorpayGateway.createOrder(ORDER);

      assert.equal(fetchMock.mock.callCount(), 2);
      assert.equal(order.id, "order_test_1");
    });

    it("does NOT retry a POST that timed out — the order may exist", async () => {
      const fetchMock = scriptFetch(timeout());

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_TIMEOUT");
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("does NOT retry a POST on a 500 — the request did reach Razorpay", async () => {
      const fetchMock = scriptFetch(failed(500, "SERVER_ERROR"));

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_REJECTED");
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("does NOT retry a POST whose 200 was unreadable — the order exists", async () => {
      const fetchMock = scriptFetch(unreadable());

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_MALFORMED");
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });

    it("rejects an order with no id as malformed, without retrying", async () => {
      const fetchMock = scriptFetch(ok({ amount: 185_000 }));

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_MALFORMED");
        return true;
      });

      assert.equal(fetchMock.mock.callCount(), 1);
    });
  });

  // ----------------------------------------------------------
  // CIRCUIT BREAKER
  // ----------------------------------------------------------

  describe("circuit breaker", () => {
    /** Five unwell POSTs — one fetch each, since a 503 is never replayed. */
    const openTheBreaker = async (fetchMock) => {
      for (let i = 0; i < 5; i += 1) {
        await assert.rejects(RazorpayGateway.createOrder(ORDER));
      }

      assert.equal(fetchMock.mock.callCount(), 5);
    };

    it("opens after five consecutive failures and then stops dialling out", async () => {
      const fetchMock = scriptFetch(failed(503, "SERVER_ERROR"));

      await openTheBreaker(fetchMock);

      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_UNREACHABLE");
        assert.equal(error.statusCode, 502);
        return true;
      });

      // The point of the whole mechanism: no sixth fetch, no ten-second wait.
      assert.equal(fetchMock.mock.callCount(), 5);
    });

    it("lets one probe through after the cooldown and closes on success", async () => {
      const fetchMock = scriptFetch(failed(503, "SERVER_ERROR"));

      mock.timers.enable({ apis: ["Date"] });

      await openTheBreaker(fetchMock);

      mock.timers.tick(30_001);

      // Razorpay is back; the probe finds it.
      globalThis.fetch = fetchMock;
      const probeFetch = scriptFetch(createdOrder);

      const order = await RazorpayGateway.createOrder(ORDER);

      assert.equal(order.id, "order_test_1");
      assert.equal(probeFetch.mock.callCount(), 1);

      // Closed again: the next call flows without waiting on a cooldown.
      await RazorpayGateway.createOrder(ORDER);
      assert.equal(probeFetch.mock.callCount(), 2);
    });

    it("stays open when the probe fails", async () => {
      const fetchMock = scriptFetch(failed(503, "SERVER_ERROR"));

      mock.timers.enable({ apis: ["Date"] });

      await openTheBreaker(fetchMock);

      mock.timers.tick(30_001);

      // The probe: allowed through, and it fails.
      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_REJECTED");
        return true;
      });
      assert.equal(fetchMock.mock.callCount(), 6);

      // A new cooldown started, so the next caller is refused without a fetch.
      await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
        assert.equal(error.code, "PAYMENT_GATEWAY_UNREACHABLE");
        return true;
      });
      assert.equal(fetchMock.mock.callCount(), 6);
    });

    it("is reset by any answer at all, including a refusal", async () => {
      // Four unwell calls, then a 400. The gateway is plainly alive, so
      // the counter goes back to zero and the next four cannot open it.
      const fetchMock = scriptFetch(failed(503, "SERVER_ERROR"));

      for (let i = 0; i < 4; i += 1) {
        await assert.rejects(RazorpayGateway.createOrder(ORDER));
      }

      scriptFetch(failed(400));
      await assert.rejects(RazorpayGateway.createOrder(ORDER));

      const afterReset = scriptFetch(failed(503, "SERVER_ERROR"));

      for (let i = 0; i < 4; i += 1) {
        await assert.rejects(RazorpayGateway.createOrder(ORDER), (error) => {
          assert.equal(error.code, "PAYMENT_GATEWAY_REJECTED");
          return true;
        });
      }

      // Still closed — four is not five.
      assert.equal(afterReset.mock.callCount(), 4);
      assert.equal(fetchMock.mock.callCount(), 4);
    });
  });
});
