// src/utils/phone.js
//
// Turning what somebody typed into a number WhatsApp can reach.
//
// Every phone number this system holds was typed by a human into a text
// box, and `validatePhone` in validators/customer.rules.js accepts all
// of `9876543210`, `919876543210` and `+91 98765 43210` on purpose — a
// shopper in a hurry should not be argued with about a leading zero.
// That generosity is right at the checkout and useless at the gateway:
// Meta wants one number in one shape, and "the same number in three
// formats" is three different recipients to it.
//
// So the normalising happens here, at the boundary, and nowhere else.
// Nothing in this file writes to a column. `orders.contact_phone` stays
// exactly as it was typed, for the same reason 008 snapshots the
// shipping address rather than joining to a live one: an order is a
// record of what was agreed, and a record that gets rewritten later is
// not one.
//
// The country default is India because the shop is in India and every
// address it ships to is `country DEFAULT 'India'`. A number that
// already carries a country code keeps it — a customer messaging from
// Dubai is not a parse error.

/**
 * The country code assumed for a bare local number.
 *
 * India. Not read from the environment, because a wrong value here does
 * not fail loudly — it silently sends every order update to a different
 * country's numbering plan, and nobody notices until a customer says
 * they never heard from the shop.
 */
export const DEFAULT_COUNTRY_CODE = "91";

/**
 * The shape Meta accepts, and the shape whatsapp_recipients.phone is
 * CHECKed against. A leading '+', a non-zero first digit, and between
 * eight and fifteen digits in total — the E.164 maximum.
 */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/** Indian mobile numbers begin 6, 7, 8 or 9. Landlines are not on WhatsApp. */
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

/**
 * Whether a value is already in the canonical form this module emits.
 *
 * Exported so the validator and the tests can ask the same question the
 * database's CHECK constraint asks, rather than each keeping their own
 * regex and drifting apart.
 */
export const isE164 = (value) => typeof value === "string" && E164.test(value);

/**
 * A phone number as Meta wants it, or null.
 *
 * Null rather than a throw, and rather than a best guess. "We could not
 * turn this into a number we can message" is an outcome, not an error:
 * it becomes a `skipped` row in the outbox carrying UNUSABLE_PHONE, and
 * the order it belongs to is unaffected. An exception here would make a
 * badly typed phone number the checkout's problem, which is precisely
 * backwards — the courier can still ring a number Meta cannot route.
 *
 * A best guess would be worse than either. Padding or truncating until
 * something matches E.164 produces a number that belongs to somebody
 * else, and sends them a stranger's order details.
 *
 * @param {unknown} raw
 * @param {{ defaultCountryCode?: string }} [options]
 * @returns {string|null} e.g. '+919876543210'
 */
export function toE164(raw, { defaultCountryCode = DEFAULT_COUNTRY_CODE } = {}) {
  if (typeof raw !== "string" && typeof raw !== "number") return null;

  const text = String(raw).trim();
  if (!text) return null;

  // Spaces, dashes, brackets and dots are formatting, not data. A '+'
  // is data, but only as the first character.
  const hasPlus = text.startsWith("+");

  // A '+' anywhere else means the input is malformed, and stripping it
  // would quietly rescue a typo into a valid number — '9+19876543210'
  // becomes '+919876543210', which is somebody's real phone and very
  // probably not the one that was meant. Refusing is recoverable: it
  // becomes a `skipped` row somebody can look at. Guessing is not.
  if (text.indexOf("+", 1) !== -1) return null;

  const digits = text.replace(/\D/g, "");

  if (!digits) return null;

  // Already international, however it was written. '+' and '00' are the
  // same statement — one is the ITU symbol, the other is what you dial
  // from a landline — so they take the same branch.
  if (hasPlus || digits.startsWith("00")) {
    const international = hasPlus ? digits : digits.slice(2);
    const candidate = `+${international}`;

    return E164.test(candidate) ? candidate : null;
  }

  // A trunk-prefixed local number: 09876543210. The leading zero is how
  // you reach a mobile from inside India and means nothing to Meta.
  const local = digits.length === 11 && digits.startsWith("0")
    ? digits.slice(1)
    : digits;

  // The ordinary case, and the one almost every row will take.
  if (INDIAN_MOBILE.test(local)) {
    return `+${defaultCountryCode}${local}`;
  }

  // Typed with the country code but no '+' — 919876543210. Checked
  // against the default rather than any country code, because a bare
  // twelve digits is only unambiguous if we already believe we know
  // where it is from.
  if (
    local.length === defaultCountryCode.length + 10 &&
    local.startsWith(defaultCountryCode) &&
    INDIAN_MOBILE.test(local.slice(defaultCountryCode.length))
  ) {
    return `+${local}`;
  }

  // Everything else. A landline, a number missing a digit, a PIN code
  // typed into the wrong box. Unroutable, and not worth guessing at.
  return null;
}

/**
 * Enough of a number to recognise it in a log, not enough to dial it.
 *
 * Phone numbers are personal data and the logger's redaction list
 * covers credentials rather than PII, so anything written to a log line
 * goes through here first. Keeping the country code and the last two
 * digits is what lets somebody match a log entry to the order they are
 * looking at without the log itself becoming a contact list.
 *
 * @param {unknown} value
 * @returns {string} e.g. '+9198*****10', or '[unusable]'
 */
export function maskPhone(value) {
  const text = typeof value === "string" ? value.trim() : "";

  if (text.length < 6) return "[unusable]";

  const head = text.slice(0, 5);
  const tail = text.slice(-2);

  return `${head}${"*".repeat(Math.max(text.length - 7, 1))}${tail}`;
}
