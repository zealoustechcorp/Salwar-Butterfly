// tests/whatsapp.receipt.test.js
//
// Reading what Meta sends back.
//
// The inbound half of the notification feature: the signature that says a
// delivery is genuine, and the walk through Meta's envelope that turns it
// into outbox updates.
//
// Everything asserted here is a pure function over bytes, so this needs
// no network, no database, no tunnel and no phone — which is the point.
// The alternative way to find out that `statuses[].timestamp` is a string
// of unix seconds is to watch a column stay null in production.
//
// Run with: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { MESSAGE_STATUS } from "../src/config/whatsapp.policy.js";
import {
  expectedReceiptSignature,
  readReceipts,
  receiptSignatureMatches,
  receiptStatusFor,
  verifyTokenMatches,
} from "../src/config/whatsapp.policy.js";

// ============================================================
// FIXTURES
// ============================================================

const APP_SECRET = "a-test-app-secret";

/** One status receipt, in Meta's own shape. */
const statusReceipt = (status, extra = {}) => ({
  id: `wamid.TEST.${status}`,
  status,
  timestamp: "1757000000",
  recipient_id: "919876543210",
  ...extra,
});

/** The envelope Meta POSTs, wrapped around whatever statuses are given. */
const envelope = (statuses, { field = "messages" } = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "102290129340398",
      changes: [
        {
          field,
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "919000000000",
              phone_number_id: "1234567890",
            },
            statuses,
          },
        },
      ],
    },
  ],
});

const rawOf = (body) => Buffer.from(JSON.stringify(body), "utf8");

// ============================================================
// SIGNATURE
// ============================================================

describe("receipt signature", () => {
  it("is the sha256= prefixed HMAC of the raw bytes", () => {
    const raw = rawOf(envelope([statusReceipt("delivered")]));

    const expected =
      "sha256=" + createHmac("sha256", APP_SECRET).update(raw).digest("hex");

    assert.equal(expectedReceiptSignature({ rawBody: raw, appSecret: APP_SECRET }), expected);
  });

  it("accepts the signature Meta would send", () => {
    const raw = rawOf(envelope([statusReceipt("read")]));

    assert.ok(
      receiptSignatureMatches({
        rawBody: raw,
        appSecret: APP_SECRET,
        signature: expectedReceiptSignature({ rawBody: raw, appSecret: APP_SECRET }),
      }),
    );
  });

  /**
   * The failure this guards is not a forgery but a mistake: verifying a
   * re-serialised body. JSON.stringify of the parsed object reorders
   * nothing here — it changes the whitespace, which is enough.
   */
  it("rejects a body that was parsed and re-serialised", () => {
    const body = envelope([statusReceipt("delivered")]);
    const raw = Buffer.from(JSON.stringify(body, null, 2), "utf8");

    assert.equal(
      receiptSignatureMatches({
        rawBody: rawOf(body),
        appSecret: APP_SECRET,
        signature: expectedReceiptSignature({ rawBody: raw, appSecret: APP_SECRET }),
      }),
      false,
    );
  });

  it("rejects a missing, short or wrong signature without throwing", () => {
    const raw = rawOf(envelope([statusReceipt("delivered")]));

    for (const signature of [undefined, null, "", "sha256=deadbeef", "nonsense"]) {
      assert.equal(
        receiptSignatureMatches({ rawBody: raw, appSecret: APP_SECRET, signature }),
        false,
      );
    }
  });

  it("rejects the right digest under the wrong secret", () => {
    const raw = rawOf(envelope([statusReceipt("delivered")]));

    assert.equal(
      receiptSignatureMatches({
        rawBody: raw,
        appSecret: APP_SECRET,
        signature: expectedReceiptSignature({ rawBody: raw, appSecret: "someone-elses" }),
      }),
      false,
    );
  });
});

// ============================================================
// HANDSHAKE
// ============================================================

describe("verify token", () => {
  it("matches only the configured string", () => {
    assert.ok(verifyTokenMatches("s3cret", "s3cret"));
    assert.equal(verifyTokenMatches("s3cre", "s3cret"), false);
    assert.equal(verifyTokenMatches("S3CRET", "s3cret"), false);
  });

  /**
   * With nothing configured, every candidate must fail — including the
   * empty string and undefined, which are what a caller sending no token
   * at all produces.
   */
  it("never matches when nothing is configured", () => {
    for (const candidate of [undefined, null, "", "anything"]) {
      assert.equal(verifyTokenMatches(candidate, null), false);
      assert.equal(verifyTokenMatches(candidate, ""), false);
    }
  });
});

// ============================================================
// STATUS MAPPING
// ============================================================

describe("receiptStatusFor", () => {
  it("maps the three receipts that move a row", () => {
    assert.equal(receiptStatusFor("delivered"), MESSAGE_STATUS.DELIVERED);
    assert.equal(receiptStatusFor("read"), MESSAGE_STATUS.READ);
    assert.equal(receiptStatusFor("failed"), MESSAGE_STATUS.FAILED);
  });

  /**
   * `sent` is null on purpose: markSent already recorded it from the
   * POST's own response, so applying it would be a write that changes
   * nothing.
   */
  it("ignores sent, and anything Meta invents later", () => {
    assert.equal(receiptStatusFor("sent"), null);
    assert.equal(receiptStatusFor("deleted"), null);
    assert.equal(receiptStatusFor(undefined), null);
  });
});

// ============================================================
// READING THE ENVELOPE
// ============================================================

describe("readReceipts", () => {
  it("pulls the wamid, the status and the timestamp", () => {
    const [receipt] = readReceipts(envelope([statusReceipt("delivered")]));

    assert.equal(receipt.providerMessageId, "wamid.TEST.delivered");
    assert.equal(receipt.status, MESSAGE_STATUS.DELIVERED);

    // Unix seconds as a string, not milliseconds. Reading it as
    // milliseconds dates every receipt to January 1970 and is silent.
    assert.equal(receipt.at, new Date(1_757_000_000_000).toISOString());

    assert.equal(receipt.errorCode, null);
    assert.equal(receipt.errorDetail, null);
  });

  it("keeps Meta's error on a failed receipt", () => {
    const [receipt] = readReceipts(
      envelope([
        statusReceipt("failed", {
          errors: [
            {
              code: 131026,
              title: "Message undeliverable",
              error_data: { details: "Receiver is not a WhatsApp user" },
            },
          ],
        }),
      ]),
    );

    assert.equal(receipt.status, MESSAGE_STATUS.FAILED);
    assert.equal(receipt.errorCode, "131026");
    assert.equal(receipt.errorDetail, "Receiver is not a WhatsApp user");
  });

  /**
   * One POST can carry receipts for several messages. Reading
   * entry[0].changes[0].value.statuses[0] works on every example in the
   * documentation and loses the rest under exactly the load that makes
   * Meta batch them.
   */
  it("walks every entry, change and status in one delivery", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        envelope([statusReceipt("delivered"), statusReceipt("read")]).entry[0],
        envelope([statusReceipt("failed")]).entry[0],
      ],
    };

    const receipts = readReceipts(body);

    assert.equal(receipts.length, 3);
    assert.deepEqual(
      receipts.map((r) => r.status),
      [MESSAGE_STATUS.DELIVERED, MESSAGE_STATUS.READ, MESSAGE_STATUS.FAILED],
    );
  });

  it("ignores a field that is not the messages subscription", () => {
    const body = envelope([statusReceipt("delivered")], {
      field: "message_template_status_update",
    });

    assert.deepEqual(readReceipts(body), []);
  });

  /**
   * An inbound message — somebody replying to the shop — arrives in the
   * same field with no `statuses` at all. It is not a receipt and must
   * not become one.
   */
  it("returns nothing for an inbound message", () => {
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [{ from: "919876543210", id: "wamid.IN", type: "text" }],
              },
            },
          ],
        },
      ],
    };

    assert.deepEqual(readReceipts(body), []);
  });

  it("survives an empty, malformed or unexpected body", () => {
    for (const body of [null, undefined, {}, { entry: null }, { entry: [{}] }, "nonsense"]) {
      assert.deepEqual(readReceipts(body), []);
    }
  });

  it("drops a receipt with no wamid rather than matching on nothing", () => {
    const body = envelope([{ status: "delivered", timestamp: "1757000000" }]);

    assert.deepEqual(readReceipts(body), []);
  });

  it("keeps a receipt whose timestamp is unusable, with a null time", () => {
    const [receipt] = readReceipts(
      envelope([statusReceipt("delivered", { timestamp: "not-a-number" })]),
    );

    assert.equal(receipt.status, MESSAGE_STATUS.DELIVERED);
    assert.equal(receipt.at, null);
  });
});
