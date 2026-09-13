// tests/payment.session.test.js
//
// The idempotency guard in PaymentService.createSession.
//
// What is asserted throughout is the *number of Razorpay orders minted*,
// because that is the whole behaviour: one for a burst of repeats, one
// more for a genuine second attempt, none at all for a reuse.
//
// The repository is replaced with an in-memory stand-in, including
// `withSessionLock` — which is given a real mutex, so two concurrent
// calls take turns here exactly as they would behind
// `pg_advisory_xact_lock`. That makes this a test of the service's
// check-then-create logic and not of the lock itself; whether Postgres
// hands out the advisory lock correctly is Postgres's business and needs
// a live database to see.
//
// Run with: npm test

import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// env.js validates at import time and the service pulls it in, so the
// variables have to exist before the dynamic imports below.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.CLOUDINARY_CLOUD_NAME ??= "test";
process.env.CLOUDINARY_API_KEY ??= "test";
process.env.CLOUDINARY_API_SECRET ??= "test";
process.env.RAZORPAY_KEY_ID ??= "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET ??= "rzp_test_secret";

const { PaymentService } = await import("../src/services/payment.service.js");
const { PaymentRepository } = await import("../src/repository/payment.repository.js");
const { OrderRepository } = await import("../src/repository/order.repository.js");
const { resetGatewayBreaker } = await import("../src/config/razorpay.gateway.js");
const { ORDER_STATUS } = await import("../src/config/order.policy.js");
const { SESSION_REUSE_WINDOW_MS, PAYMENT_ATTEMPT_STATUS } = await import(
  "../src/config/payment.policy.js"
);

const ORDER_ID = "3f1a7c2e-9b84-4d61-8a05-6c7e2f9d4b13";

// ============================================================
// THE STAND-IN DATABASE
// ============================================================

let orders;
let payments;

/** Rows are read back the way Postgres returns them: newest first. */
const openAttempts = (orderId) =>
  payments
    .filter(
      (row) =>
        row.order_id === orderId && row.status === PAYMENT_ATTEMPT_STATUS.CREATED,
    )
    .sort((a, b) => b.created_at - a.created_at);

/**
 * A mutex per order id, standing in for the advisory lock.
 *
 * Without this the test cannot tell the fix from the bug: two concurrent
 * calls would interleave freely and both would find an empty table, which
 * is precisely the failure being guarded against.
 */
const makeLock = () => {
  const queues = new Map();

  return async (orderId, fn) => {
    const ahead = queues.get(orderId) ?? Promise.resolve();

    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });

    queues.set(
      orderId,
      ahead.then(() => held),
    );

    await ahead;

    try {
      return await fn({ /* a client nothing in the stand-in reads */ });
    } finally {
      release();
    }
  };
};

const anOrder = (overrides = {}) => ({
  id: ORDER_ID,
  order_number: "SB-1043",
  status: ORDER_STATUS.PENDING_PAYMENT,
  total: "1850.00",
  currency: "INR",
  contact_name: "Priya",
  contact_email: "priya@example.com",
  contact_phone: "9000000000",
  ...overrides,
});

/** An attempt already on the table, `ageMs` old. */
const anAttempt = ({ ageMs = 0, amount = "1850.00", currency = "INR" } = {}) => {
  const row = {
    id: `pay-${payments.length + 1}`,
    order_id: ORDER_ID,
    provider: "razorpay",
    provider_order_id: `order_EXISTING${payments.length + 1}`,
    provider_payment_id: null,
    status: PAYMENT_ATTEMPT_STATUS.CREATED,
    amount,
    currency,
    created_at: new Date(Date.now() - ageMs),
  };

  payments.push(row);

  return row;
};

// ============================================================
// THE GATEWAY
// ============================================================

let minted;

/** A fetch that mints a distinct Razorpay order every time it is called. */
const mintingFetch = () => {
  const fake = mock.fn(async () => {
    minted += 1;

    return {
      ok: true,
      status: 200,
      json: async () => ({ id: `order_MINTED${minted}`, amount: 185000 }),
    };
  });

  globalThis.fetch = fake;

  return fake;
};

// ============================================================

const realFetch = globalThis.fetch;

beforeEach(() => {
  orders = new Map([[ORDER_ID, anOrder()]]);
  payments = [];
  minted = 0;

  resetGatewayBreaker();

  mock.method(OrderRepository, "findById", async (id) => orders.get(id) ?? null);

  mock.method(PaymentRepository, "withSessionLock", makeLock());

  mock.method(
    PaymentRepository,
    "findLatestOpenAttempt",
    async (orderId) => openAttempts(orderId)[0] ?? null,
  );

  mock.method(
    PaymentRepository,
    "create",
    async ({ orderId, provider, providerOrderId, amount, currency }) => {
      const row = {
        id: `pay-${payments.length + 1}`,
        order_id: orderId,
        provider,
        provider_order_id: providerOrderId,
        provider_payment_id: null,
        status: PAYMENT_ATTEMPT_STATUS.CREATED,
        amount: String(amount),
        currency,
        created_at: new Date(),
      };

      payments.push(row);

      return row;
    },
  );
});

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
});

describe("PaymentService.createSession", () => {
  describe("duplicate suppression", () => {
    it("returns one session to two concurrent calls", async () => {
      const fetched = mintingFetch();

      const [a, b] = await Promise.all([
        PaymentService.createSession(ORDER_ID),
        PaymentService.createSession(ORDER_ID),
      ]);

      assert.equal(
        fetched.mock.callCount(),
        1,
        "a second Razorpay order was minted for the same click",
      );
      assert.equal(a.providerOrderId, b.providerOrderId);
      assert.equal(payments.length, 1);
    });

    it("reuses an attempt opened moments ago without calling Razorpay", async () => {
      const existing = anAttempt({ ageMs: 1_500 });

      const fetched = mintingFetch();

      const session = await PaymentService.createSession(ORDER_ID);

      assert.equal(fetched.mock.callCount(), 0);
      assert.equal(session.providerOrderId, existing.provider_order_id);
      assert.equal(payments.length, 1);
    });

    it("survives a retry loop: twenty calls, one Razorpay order", async () => {
      const fetched = mintingFetch();

      const sessions = await Promise.all(
        Array.from({ length: 20 }, () => PaymentService.createSession(ORDER_ID)),
      );

      assert.equal(fetched.mock.callCount(), 1);
      assert.equal(new Set(sessions.map((s) => s.providerOrderId)).size, 1);
      assert.equal(payments.length, 1);
    });
  });

  describe("the audit trail survives", () => {
    it("opens a new attempt once the window has passed", async () => {
      const stale = anAttempt({ ageMs: SESSION_REUSE_WINDOW_MS + 60_000 });

      const fetched = mintingFetch();

      const session = await PaymentService.createSession(ORDER_ID);

      assert.equal(fetched.mock.callCount(), 1);
      assert.notEqual(session.providerOrderId, stale.provider_order_id);
      assert.equal(payments.length, 2, "the old attempt should still be there");
    });

    it("does not reuse an attempt whose amount no longer matches the order", async () => {
      const cheap = anAttempt({ ageMs: 1_000, amount: "1850.00" });

      orders.set(ORDER_ID, anOrder({ total: "2100.00" }));

      const fetched = mintingFetch();

      const session = await PaymentService.createSession(ORDER_ID);

      assert.equal(fetched.mock.callCount(), 1);
      assert.notEqual(session.providerOrderId, cheap.provider_order_id);
      assert.equal(Number(payments.at(-1).amount), 2100);
    });

    it("ignores a failed attempt — a declined card must get a new sheet", async () => {
      const declined = anAttempt({ ageMs: 1_000 });
      declined.status = PAYMENT_ATTEMPT_STATUS.FAILED;

      const fetched = mintingFetch();

      const session = await PaymentService.createSession(ORDER_ID);

      assert.equal(fetched.mock.callCount(), 1);
      assert.notEqual(session.providerOrderId, declined.provider_order_id);
    });
  });

  describe("the re-check inside the lock", () => {
    it("refuses an order that stopped awaiting payment while it queued", async () => {
      const fetched = mintingFetch();

      // createSession reads the order twice: once before the lock, and
      // once inside it. Answering the first read "pending" and the
      // second "confirmed" is exactly the window being guarded — the
      // request ahead of this one in the queue was the one that got
      // paid, and it committed while this one waited its turn.
      let reads = 0;

      mock.method(OrderRepository, "findById", async () => {
        reads += 1;

        return reads === 1
          ? anOrder()
          : anOrder({ status: ORDER_STATUS.CONFIRMED });
      });

      await assert.rejects(PaymentService.createSession(ORDER_ID), (error) => {
        assert.equal(error.statusCode ?? error.status, 409);
        assert.match(error.message, /already been paid for/);
        return true;
      });

      assert.equal(reads, 2, "the status must be re-read inside the lock");
      assert.equal(fetched.mock.callCount(), 0, "no order should have been minted");
    });
  });

  describe("the idempotency key", () => {
    it("sends one on the order POST", async () => {
      const fetched = mintingFetch();

      await PaymentService.createSession(ORDER_ID);

      const [, init] = fetched.mock.calls[0].arguments;
      const key = init.headers["X-Razorpay-Idempotency-Key"];

      assert.match(
        key,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("differs between two genuine attempts on the same order", async () => {
      anAttempt({ ageMs: SESSION_REUSE_WINDOW_MS + 60_000 });

      const fetched = mintingFetch();

      await PaymentService.createSession(ORDER_ID);

      // Age the attempt just made, so the next call is a new attempt too.
      payments.at(-1).created_at = new Date(
        Date.now() - SESSION_REUSE_WINDOW_MS - 60_000,
      );

      await PaymentService.createSession(ORDER_ID);

      const keyOf = (call) =>
        call.arguments[1].headers["X-Razorpay-Idempotency-Key"];

      assert.notEqual(keyOf(fetched.mock.calls[0]), keyOf(fetched.mock.calls[1]));
    });
  });
});
