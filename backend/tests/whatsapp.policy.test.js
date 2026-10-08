// tests/whatsapp.policy.test.js
//
// The template catalogue in config/whatsapp.policy.js.
//
// The cheapest test in this repo and the one that catches the most.
//
// A WhatsApp template is approved by Meta with a fixed number of {{n}}
// placeholders. Sending it with a different number of parameters fails
// with error 132000, a newline inside a parameter fails with 132007, an
// empty one fails too — and every one of those failures is invisible
// until a real order tries to send. There is no staging WhatsApp.
//
// So this file renders every template in the catalogue against a
// deliberately hostile order and asserts the result is something Meta
// will accept. It needs no network, no database and no credentials.
//
// Run with: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ORDER_STATUS, ORDER_STATUSES } from "../src/config/order.policy.js";
import {
  DEFAULT_ADMIN_EVENTS,
  EVENT_FOR_STATUS,
  MESSAGE_STATUSES,
  NOTIFY_AUDIENCE,
  NOTIFY_AUDIENCES,
  NOTIFY_EVENT,
  NOTIFY_EVENTS,
  WHATSAPP_TEMPLATES,
  buildParams,
  eventForStatus,
  eventsForAudience,
  formatMoney,
  orderContext,
  sanitizeParam,
  templateFor,
} from "../src/config/whatsapp.policy.js";

// ============================================================
// FIXTURES
// ============================================================

/** An ordinary order, as the repository hands one over. */
const ordinaryRow = {
  order_number: "SB-001042",
  contact_name: "Meera Krishnan",
  total: "2499.00",
  currency: "INR",
  shipping_city: "Coimbatore",
  cancellation_reason: null,
};

/**
 * The same order after a bad day: free text with newlines in it, a name
 * long enough to blow the parameter limit, a missing total. Every one of
 * these is reachable — `contact_name` is a text box and
 * `cancellation_reason` is a TEXT column with no length limit.
 */
const hostileRow = {
  order_number: "SB-001043",
  contact_name: `${"Ram ".repeat(400)}`,
  total: null,
  currency: "XYZ",
  shipping_city: "",
  cancellation_reason: "Customer\nchanged\ttheir mind.\r\n\r\nRefund     requested.",
};

const everyTemplate = NOTIFY_AUDIENCES.flatMap((audience) =>
  NOTIFY_EVENTS.map((event) => ({ audience, event, template: templateFor(audience, event) })).filter(
    (entry) => entry.template !== null,
  ),
);

// ============================================================
// SHAPE
// ============================================================

describe("the catalogue's shape", () => {
  it("has at least one template", () => {
    assert.ok(everyTemplate.length > 0);
  });

  for (const { audience, event, template } of everyTemplate) {
    describe(`${audience}:${event}`, () => {
      it("declares a name, a language, a paramCount and a builder", () => {
        assert.equal(typeof template.name, "string");
        assert.ok(template.name.length > 0);
        assert.equal(typeof template.language, "string");
        assert.ok(template.language.length > 0);
        assert.equal(typeof template.paramCount, "number");
        assert.ok(Number.isInteger(template.paramCount) && template.paramCount >= 0);
        assert.equal(typeof template.params, "function");
      });

      it("is frozen, so nothing can rewrite the shop's wording at runtime", () => {
        assert.equal(Object.isFrozen(template), true);
      });
    });
  }

  it("gives every template a distinct name", () => {
    // Two entries sharing a name means one of them renders the other's
    // wording — and Meta would accept it, because the name is all it
    // checks.
    const names = everyTemplate.map(({ template }) => template.name);

    assert.equal(new Set(names).size, names.length, `duplicate template name in ${names}`);
  });
});

// ============================================================
// THE ONE THAT MATTERS — parameter arity and content
// ============================================================

describe("rendered parameters are acceptable to Meta", () => {
  for (const row of [ordinaryRow, hostileRow]) {
    const label = row === ordinaryRow ? "an ordinary order" : "an order full of hostile text";

    for (const { audience, event, template } of everyTemplate) {
      it(`${audience}:${event} renders correctly for ${label}`, () => {
        const ctx = orderContext(row, { unitCount: 3 });
        const params = buildParams(audience, event, ctx);

        assert.ok(Array.isArray(params), "buildParams must return an array");

        // 132000: "number of parameters does not match the expected
        // number of params". The single most common way this
        // integration breaks in production.
        assert.equal(
          params.length,
          template.paramCount,
          `${template.name} is approved with ${template.paramCount} placeholders ` +
            `but the builder produced ${params.length}`,
        );

        for (const [index, value] of params.entries()) {
          const where = `${template.name} parameter {{${index + 1}}}`;

          assert.equal(typeof value, "string", `${where} is not a string`);

          // Meta rejects an empty parameter outright.
          assert.ok(value.length > 0, `${where} is empty`);

          // 132007 / 132012: newlines, tabs, or four-plus spaces.
          assert.equal(/[\r\n\t]/.test(value), false, `${where} contains a newline or tab`);
          assert.equal(/ {4,}/.test(value), false, `${where} contains four or more spaces`);

          assert.ok(value.length <= 1024, `${where} is longer than 1024 characters`);
        }
      });
    }
  }

  it("renders when unitCount is unknown rather than producing an empty slot", () => {
    const ctx = orderContext(ordinaryRow, { unitCount: null });
    const params = buildParams(NOTIFY_AUDIENCE.ADMIN, NOTIFY_EVENT.ORDER_PAID, ctx);

    assert.equal(params.length, 5);
    for (const value of params) assert.ok(value.length > 0);
  });

  it("survives a completely empty row", () => {
    // Defensive: a row that failed to load should not take the emit
    // path down with a TypeError.
    const ctx = orderContext({}, {});

    for (const { audience, event, template } of everyTemplate) {
      const params = buildParams(audience, event, ctx);

      assert.equal(params.length, template.paramCount);
      for (const value of params) assert.ok(value.length > 0);
    }
  });
});

// ============================================================
// LOOKUPS
// ============================================================

describe("templateFor", () => {
  it("returns null for an unknown audience rather than throwing", () => {
    assert.equal(templateFor("nonsense", NOTIFY_EVENT.ORDER_PAID), null);
    assert.equal(templateFor(undefined, undefined), null);
  });

  it("returns null for an unknown event", () => {
    assert.equal(templateFor(NOTIFY_AUDIENCE.ADMIN, "order_teleported"), null);
  });
});

describe("eventsForAudience", () => {
  it("lists only events that actually have a template", () => {
    for (const audience of NOTIFY_AUDIENCES) {
      for (const event of eventsForAudience(audience)) {
        assert.notEqual(templateFor(audience, event), null);
      }
    }
  });

  it("is empty for an audience nobody defined", () => {
    assert.deepEqual(eventsForAudience("nonsense"), []);
  });
});

describe("DEFAULT_ADMIN_EVENTS", () => {
  it("only names events an admin can actually receive", () => {
    // A default that points at a missing template would create a
    // recipient subscribed to silence.
    for (const event of DEFAULT_ADMIN_EVENTS) {
      assert.notEqual(
        templateFor(NOTIFY_AUDIENCE.ADMIN, event),
        null,
        `${event} is a default admin subscription with no admin template`,
      );
    }
  });
});

// ============================================================
// THE STATUS BRIDGE
// ============================================================

describe("EVENT_FOR_STATUS", () => {
  it("covers every order status except pending_payment", () => {
    for (const status of ORDER_STATUSES) {
      if (status === ORDER_STATUS.PENDING_PAYMENT) continue;

      assert.ok(
        EVENT_FOR_STATUS[status],
        `${status} has no notification event — adding a status means ` +
          "deciding whether anybody is told about it",
      );
    }
  });

  it("leaves pending_payment deliberately unannounced", () => {
    assert.equal(eventForStatus(ORDER_STATUS.PENDING_PAYMENT), null);
  });

  it("maps only to events that exist", () => {
    for (const event of Object.values(EVENT_FOR_STATUS)) {
      assert.ok(NOTIFY_EVENTS.includes(event));
    }
  });

  it("returns null for an unknown status", () => {
    assert.equal(eventForStatus("order_teleported"), null);
  });
});

// ============================================================
// AGREEMENT WITH THE MIGRATION
// ============================================================
//
// The event and status vocabularies are written twice: once here, and
// once as a CHECK constraint in the migration. That duplication is
// deliberate — the migration's comment says so — and this is what stops
// the two copies drifting into a constraint violation nobody sees until
// an order is paid for.

describe("the migration's CHECK constraints", () => {
  const sql = readFileSync(
    new URL("../src/migrations/023_create_whatsapp_notifications.sql", import.meta.url),
    "utf8",
  );

  /** Pull the quoted values out of `CHECK (col IN ('a', 'b'))`. */
  const checkedValues = (column) => {
    const match = sql.match(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, "i"));

    assert.ok(match, `no CHECK constraint on ${column} found in migration 023`);

    return match[1]
      .split(",")
      .map((part) => part.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
      .sort();
  };

  it("lists exactly the events NOTIFY_EVENT defines", () => {
    assert.deepEqual(checkedValues("event"), [...NOTIFY_EVENTS].sort());
  });

  it("lists exactly the audiences NOTIFY_AUDIENCE defines", () => {
    assert.deepEqual(checkedValues("audience"), [...NOTIFY_AUDIENCES].sort());
  });

  it("lists exactly the statuses MESSAGE_STATUS defines", () => {
    assert.deepEqual(checkedValues("status"), [...MESSAGE_STATUSES].sort());
  });
});

// ============================================================
// HELPERS
// ============================================================

describe("sanitizeParam", () => {
  const cases = [
    ["plain", "plain"],
    ["  padded  ", "padded"],
    ["two\nlines", "two lines"],
    ["a\tb", "a b"],
    ["a\r\n\r\nb", "a b"],
    ["wide      gap", "wide   gap"],
    ["", "—"],
    ["   ", "—"],
    [null, "—"],
    [undefined, "—"],
    [0, "0"],
    [false, "false"],
  ];

  for (const [input, expected] of cases) {
    it(`turns ${JSON.stringify(input)} into ${JSON.stringify(expected)}`, () => {
      assert.equal(sanitizeParam(input), expected);
    });
  }

  it("never returns something Meta would reject", () => {
    const nasty = `${"x".repeat(2000)}\n\n\t    spaced`;
    const result = sanitizeParam(nasty);

    assert.ok(result.length > 0 && result.length <= 1024);
    assert.equal(/[\r\n\t]/.test(result), false);
    assert.equal(/ {4,}/.test(result), false);
  });
});

describe("formatMoney", () => {
  it("formats rupees the way an Indian reader expects", () => {
    // en-IN uses a non-breaking space after the symbol in some Node
    // builds, so assert on the parts rather than an exact string.
    const formatted = formatMoney("2499.00", "INR");

    assert.ok(formatted.includes("2,499.00"), formatted);
    assert.ok(formatted.includes("₹"), formatted);
  });

  it("groups lakhs the Indian way", () => {
    assert.ok(formatMoney(123456, "INR").includes("1,23,456.00"));
  });

  it("does not throw on a bad amount or a bad currency", () => {
    assert.equal(formatMoney(null), "—");
    assert.equal(formatMoney("not a number"), "—");
    assert.equal(typeof formatMoney(10, "XYZ"), "string");
  });
});

describe("orderContext", () => {
  it("takes the first name for addressing the shopper", () => {
    assert.equal(orderContext(ordinaryRow).firstName, "Meera");
  });

  it("falls back rather than producing an empty parameter", () => {
    assert.equal(orderContext({}).firstName, "—");
    assert.equal(orderContext({ contact_name: "   " }).contactName, "—");
  });

  it("exposes no column a template was not meant to read", () => {
    // The guard against a future template mentioning admin_note.
    const ctx = orderContext({ ...ordinaryRow, admin_note: "do not ship, suspected fraud" });

    assert.equal(Object.values(ctx).includes("do not ship, suspected fraud"), false);
    assert.equal("adminNote" in ctx, false);
  });
});
