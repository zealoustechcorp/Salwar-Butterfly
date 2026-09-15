// tests/phone.test.js
//
// The E.164 normaliser in utils/phone.js.
//
// A pure function with no imports worth stubbing — no env, no database,
// no network — so this file is a table and two loops.
//
// The last assertion in this file is the one that matters most: every
// value toE164 is willing to emit must satisfy the same regex that
// migration 023 puts in whatsapp_recipients.phone's CHECK constraint. A
// normaliser and a constraint that disagree produce a row the
// application believes it wrote and the database refused, which is a
// 500 on a screen that was working yesterday.
//
// Run with: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_COUNTRY_CODE, isE164, maskPhone, toE164 } from "../src/utils/phone.js";

// ============================================================
// THE TABLE
// ============================================================

/**
 * Every shape a phone number has actually arrived in, and what it
 * should become. The `why` column is there so a failure names the case
 * rather than the index.
 */
const ACCEPTED = [
  ["9876543210", "+919876543210", "a bare Indian mobile — the ordinary case"],
  ["919876543210", "+919876543210", "country code, no plus"],
  ["+919876543210", "+919876543210", "already canonical"],
  ["+91 98765 43210", "+919876543210", "spaces, as a phone keypad shows it"],
  ["98765-43210", "+919876543210", "dashes"],
  ["(98765) 43210", "+919876543210", "brackets"],
  ["09876543210", "+919876543210", "trunk prefix, as dialled inside India"],
  ["00919876543210", "+919876543210", "international prefix instead of a plus"],
  ["  9876543210  ", "+919876543210", "untrimmed"],
  ["+14155552671", "+14155552671", "a non-Indian number keeps its own country"],
  ["+1 415 555 2671", "+14155552671", "ditto, formatted"],
  [9876543210, "+919876543210", "a number, not a string — JSON does this"],
  ["6000000000", "+916000000000", "Indian mobiles may begin 6"],
  ["9999999999", "+919999999999", "…through 9"],
];

const REJECTED = [
  ["", "empty"],
  ["   ", "whitespace only"],
  [null, "null"],
  [undefined, "undefined"],
  [{}, "an object"],
  [[], "an array"],
  [true, "a boolean"],
  ["abcdefghij", "letters"],
  ["+", "a plus and nothing else"],
  ["12345", "too short to be anything"],
  ["1234567890", "ten digits starting 1 — not an Indian mobile"],
  ["5876543210", "ten digits starting 5 — ditto"],
  ["0123456789", "a trunk zero in front of a non-mobile"],
  ["+9198765432101234", "longer than E.164 permits"],
  ["+0123456789", "E.164 forbids a leading zero after the plus"],
  ["987654321", "nine digits — a missing digit, not a number"],
  ["98765432101", "eleven digits with no leading zero"],
  ["9+19876543210", "a plus that is not the first character"],
];

// ============================================================
// toE164
// ============================================================

describe("toE164", () => {
  for (const [input, expected, why] of ACCEPTED) {
    it(`accepts ${JSON.stringify(input)} — ${why}`, () => {
      assert.equal(toE164(input), expected);
    });
  }

  for (const [input, why] of REJECTED) {
    it(`rejects ${JSON.stringify(input)} — ${why}`, () => {
      assert.equal(
        toE164(input),
        null,
        "an unusable number must be null, never a guess — a padded or " +
          "truncated number belongs to somebody else",
      );
    });
  }

  it("is idempotent — normalising its own output changes nothing", () => {
    // The outbox writes a normalised number and the gateway reads it
    // back; anything that shifted on a second pass would drift.
    for (const [input] of ACCEPTED) {
      const once = toE164(input);
      assert.equal(toE164(once), once, `not idempotent for ${JSON.stringify(input)}`);
    }
  });

  it("honours an explicit country code", () => {
    assert.equal(
      toE164("4155552671", { defaultCountryCode: "1" }),
      null,
      "the local-mobile rule is India's — it must not fire for another country",
    );
  });

  it("defaults to India", () => {
    assert.equal(DEFAULT_COUNTRY_CODE, "91");
    assert.equal(toE164("9876543210"), `+${DEFAULT_COUNTRY_CODE}9876543210`);
  });
});

// ============================================================
// THE CONSTRAINT AGREEMENT
// ============================================================

describe("toE164 output and the database CHECK constraint", () => {
  // Copied deliberately, character for character, from
  // whatsapp_recipients.phone's CHECK in migration 023. Duplicated
  // rather than imported because the point is to catch the two drifting
  // apart — importing the same source would prove nothing.
  const MIGRATION_CHECK = /^\+[1-9][0-9]{7,14}$/;

  it("every accepted value satisfies the migration's regex", () => {
    for (const [input] of ACCEPTED) {
      const normalised = toE164(input);

      assert.ok(
        MIGRATION_CHECK.test(normalised),
        `${JSON.stringify(input)} normalised to ${normalised}, which the ` +
          "whatsapp_recipients.phone CHECK constraint would reject",
      );
    }
  });

  it("isE164 agrees with the migration's regex", () => {
    for (const [input] of ACCEPTED) {
      assert.equal(isE164(toE164(input)), true);
    }

    for (const [input] of REJECTED) {
      assert.equal(isE164(input), false);
    }
  });
});

// ============================================================
// maskPhone
// ============================================================

describe("maskPhone", () => {
  it("keeps the country code and the last two digits", () => {
    const masked = maskPhone("+919876543210");

    assert.ok(masked.startsWith("+9198"));
    assert.ok(masked.endsWith("10"));
  });

  it("never leaks enough digits to dial", () => {
    // The whole point: a log line should let somebody recognise a
    // number they are already looking at, not collect one they are not.
    for (const [input] of ACCEPTED) {
      const masked = maskPhone(toE164(input));

      assert.equal(
        /[0-9]{5,}/.test(masked.slice(1)),
        false,
        `${masked} exposes five or more consecutive digits`,
      );
    }
  });

  it("does not throw on anything", () => {
    for (const [input] of REJECTED) {
      assert.equal(typeof maskPhone(input), "string");
    }
  });
});
