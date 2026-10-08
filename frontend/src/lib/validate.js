/**
 * Client-side field validation, mirroring the API's own validators.
 *
 * The server is still the authority — every rule here exists behind the
 * endpoint too, in backend/src/validators/*.rules.js, and nothing in this
 * file is trusted by it. What this buys is the round trip: a shopper who
 * mistypes their PIN code finds out under the field they are looking at,
 * not after the address, the note and the "place order" button.
 *
 * The messages are copied from the backend deliberately, not paraphrased.
 * The same mistake caught here and caught there should read identically,
 * or a shopper who fixes one message only to meet a different wording for
 * the same problem learns to distrust both.
 *
 * Where the two could drift, the backend wins:
 *
 *   customer.rules.js   → validateName / validateEmail / validatePhone / validatePassword
 *   address.rules.js    → validateAddressText / validatePostalCode / validateAddressFields
 *   product.rules.js    → validateProductName / validateSlug / validateBasePrice / …
 *   admin.rules.js      → validateLoginPassword
 *
 * Every rule returns a message string when the value is wrong and `null`
 * when it is fine, so they compose into a `{ field: message }` map — the
 * same shape the API returns its errors in, which is what lets a form
 * render both through one code path.
 */

// ============================================================
// CUSTOMER FIELDS  (backend/src/validators/customer.rules.js)
// ============================================================

export function validateName(name, required = true) {
  if (name === undefined || name === null) {
    return required ? "Name is required" : null;
  }

  const value = String(name).trim();

  if (!value) return required ? "Name is required" : null;
  if (value.length < 2) return "Name must be at least 2 characters";
  if (value.length > 255) return "Name must not exceed 255 characters";

  return null;
}

/**
 * Deliberately the backend's regex and not a stricter one. Anything more
 * exact rejects addresses that genuinely deliver, and the only test that
 * settles whether an address works is sending mail to it.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email, required = true) {
  if (email === undefined || email === null) {
    return required ? "Email is required" : null;
  }

  const value = String(email).trim().toLowerCase();

  if (!value) return required ? "Email is required" : null;
  if (value.length > 255) return "Email must not exceed 255 characters";
  if (!EMAIL_REGEX.test(value)) return "Invalid email format";

  return null;
}

/**
 * Accepts +919876543210, 919876543210 and 9876543210 — the three ways a
 * number gets written down in India. Spaces and dashes are stripped
 * first: somebody typing "98765 43210" has given a valid number, and
 * refusing it over a space is the validator being difficult.
 */
const PHONE_REGEX = /^\+?[1-9]\d{9,14}$/;

export function validatePhone(phone, required = true) {
  if (phone === undefined || phone === null) {
    return required ? "Phone number is required" : null;
  }

  const value = String(phone).trim();

  if (!value) return required ? "Phone number is required" : null;
  if (!PHONE_REGEX.test(value.replace(/[\s-]/g, ""))) {
    return "Invalid phone number format";
  }

  return null;
}

/**
 * A password being *set*. bcrypt truncates at 72 bytes, so the ceiling is
 * a hard limit rather than a house style.
 */
export function validatePassword(password, required = true) {
  if (password === undefined || password === null) {
    return required ? "Password is required" : null;
  }

  const value = String(password);

  if (!value) return required ? "Password is required" : null;
  if (value.length < 8) return "Password must be at least 8 characters";
  if (value.length > 72) return "Password must not exceed 72 characters";

  return null;
}

/**
 * A password being *checked*, which is a different question.
 *
 * Only presence and the bcrypt ceiling, matching admin.rules.js. Applying
 * the strength rules to a sign-in would refuse a legitimate password that
 * predates a policy change, and would tell whoever is guessing which
 * candidates are even worth submitting.
 */
export function validateLoginPassword(password) {
  const value = String(password ?? "");

  if (!value) return "Password is required";
  if (value.length > 72) return "Password must not exceed 72 characters";

  return null;
}

// ============================================================
// ADDRESS FIELDS  (backend/src/validators/address.rules.js)
// ============================================================

/**
 * A free-text line of an address.
 *
 * Loose on what it accepts, on purpose. An address line is whatever the
 * postal system will carry, and every character class an over-eager
 * validator refuses is a house somebody actually lives in. What it checks
 * is that something is there and that it fits the column.
 */
export function validateAddressText(value, label, { required = true, max = 255 } = {}) {
  if (value === undefined || value === null) {
    return required ? `${label} is required` : null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) return required ? `${label} is required` : null;
  if (trimmed.length > max) return `${label} must not exceed ${max} characters`;

  return null;
}

/** Six digits, not starting at zero — the Indian PIN format. */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function validatePostalCode(value, required = true) {
  const postalCode = String(value ?? "").trim();

  if (!postalCode) return required ? "PIN code is required" : null;
  if (!PINCODE_REGEX.test(postalCode)) return "PIN code must be 6 digits";

  return null;
}

/**
 * Every field of one address, as `{ field: message }`.
 *
 * `prefix` is what checkout passes to get `shippingAddress.city` rather
 * than a bare `city`, since its payload carries contact details and order
 * lines under the same map — exactly what the API does with the same
 * argument, so the two error maps line up key for key.
 */
export function validateAddressFields(address, { prefix = "" } = {}) {
  const key = (field) => (prefix ? `${prefix}.${field}` : field);

  return collect([
    [key("label"), validateAddressText(address?.label, "Label", { required: false, max: 40 })],
    [key("line1"), validateAddressText(address?.line1, "Address line 1")],
    [key("line2"), validateAddressText(address?.line2, "Address line 2", { required: false })],
    [key("landmark"), validateAddressText(address?.landmark, "Landmark", { required: false })],
    [key("city"), validateAddressText(address?.city, "City", { max: 120 })],
    [key("state"), validateAddressText(address?.state, "State", { max: 120 })],
    [key("country"), validateAddressText(address?.country, "Country", { required: false, max: 80 })],
    [key("postalCode"), validatePostalCode(address?.postalCode)],
  ]);
}

// ============================================================
// ORDERS
// ============================================================

/**
 * The handle on a confirmation — "SB-001042".
 *
 * The shape check is a courtesy rather than a gate: a number that does not
 * look like one has certainly been mistyped, and saying so beats a lookup
 * that comes back "no such order" and leaves them wondering whether the
 * email was the wrong half. Bare digits are accepted because that is what
 * somebody reading it off a screen types.
 */
export function validateOrderNumber(value) {
  const number = String(value ?? "").trim();

  if (!number) return "Order number is required";
  if (number.length > 24) return "That is not an order number";
  if (!/^(sb-)?\d{3,}$/i.test(number)) {
    return "Order numbers look like SB-001042";
  }

  return null;
}

/** "sb-1042" and "1042" both become "SB-001042" — what the API stores. */
export function normalizeOrderNumber(value) {
  const number = String(value ?? "").trim();
  const digits = number.replace(/^sb-/i, "");

  if (!/^\d+$/.test(digits)) return number;

  return `SB-${digits.padStart(6, "0")}`;
}

/** The optional note a shopper leaves on an order. */
export function validateNote(value, label = "Note", max = 1000) {
  return validateAddressText(value, label, { required: false, max });
}

// ============================================================
// CATALOGUE  (backend/src/validators/product.rules.js)
// ============================================================

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateProductName(value, required = true) {
  if (value === undefined || value === null) {
    return required ? "Product name is required" : null;
  }

  const name = String(value).trim();

  if (!name) return required ? "Product name is required" : null;
  if (name.length < 2) return "Product name must be at least 2 characters";
  if (name.length > 200) return "Product name must not exceed 200 characters";

  return null;
}

export function validateSlug(value, { label = "Slug", required = true, max = 255 } = {}) {
  if (value === undefined || value === null) {
    return required ? `${label} is required` : null;
  }

  const slug = String(value).trim().toLowerCase();

  if (!slug) return required ? `${label} is required` : null;
  if (slug.length < 2) return `${label} must be at least 2 characters`;
  if (slug.length > max) return `${label} must not exceed ${max} characters`;
  if (!SLUG_REGEX.test(slug)) {
    return `${label} may contain only lowercase letters, numbers and single hyphens`;
  }

  return null;
}

export function validateDescription(value, max = 5000) {
  if (value === undefined || value === null || value === "") return null;

  if (String(value).trim().length > max) {
    return `Description must not exceed ${max} characters`;
  }

  return null;
}

/** The smallest `current_price` can hold — the column is DECIMAL(10,2). */
export const MIN_PRICE = 0.01;

/**
 * The list price.
 *
 * Zero is refused, not just negatives. `base_price >= 0` is all the column
 * enforces, but a product listed at ₹0 is never a giveaway the shop meant
 * — it is a field somebody left blank, or a `Number("")` that fell through
 * as 0, and it reaches the storefront as a Buy button for nothing.
 *
 * The floor is a paisa rather than "anything above zero", because prices
 * are stored to two decimal places: ₹0.004 is a positive number that the
 * database rounds to ₹0.00, which is the same free product by a longer
 * route.
 *
 * `Number.isFinite` rather than `!Number.isNaN`, which lets Infinity
 * through — `Number("1e999")` is Infinity, and it passes a `> 999999.99`
 * check by failing to be less than it.
 */
export function validateBasePrice(value, required = true) {
  if (value === undefined || value === null || value === "") {
    return required ? "Base price is required" : null;
  }

  const price = Number(value);

  if (!Number.isFinite(price)) return "Base price must be a number";
  if (price < 0) return "Base price cannot be negative";
  if (price < MIN_PRICE) return `Base price must be at least ₹${MIN_PRICE.toFixed(2)}`;
  if (price > 999999.99) return "Base price exceeds maximum limit";

  return null;
}

export function validateDiscountPercentage(value) {
  if (value === undefined || value === null || value === "") return null;

  const discount = Number(value);

  if (!Number.isFinite(discount)) return "Discount percentage must be a number";
  if (discount < 0) return "Discount percentage cannot be negative";
  if (discount > 100) return "Discount percentage must be between 0 and 100";

  return null;
}

/**
 * What the customer actually pays, derived exactly as the API derives it
 * (`calculateCurrentPrice` in backend/src/services/product.service.js).
 *
 * Copied rather than approximated because the rounding is the point: a
 * base of ₹100 at 99.99% off is ₹0.01 before rounding and ₹0.00 after, and
 * a check that skipped the rounding would pass a product the shop then
 * sells for nothing.
 */
export function calculateSalePrice(basePrice, discountPercentage) {
  const base = Number(basePrice);
  const discount = Number(discountPercentage) || 0;

  if (!Number.isFinite(base) || base < 0) return 0;
  if (discount < 0 || discount > 100) return base;

  return Math.round((base - (base * discount) / 100) * 100) / 100;
}

/**
 * The two price fields together, which is where the real rule lives.
 *
 * Base price and discount are each valid on their own and still produce a
 * free product between them — 100% off, or a base so small the discount
 * rounds it away. Checking the derived figure catches every route to ₹0 in
 * one place, including ones nobody has thought of yet.
 *
 * Belongs against `discountPercentage`, and always does now that the base
 * price has a paisa floor of its own: with a valid base, the only way to
 * reach ₹0 is the discount, so the discount is the field that has to
 * change. Pointing at the other one would send the admin to fix a number
 * that was never wrong.
 */
export function validateSalePrice(basePrice, discountPercentage) {
  // Whatever is wrong with them separately is a better message than
  // anything derived from the pair, so let those be reported first.
  if (validateBasePrice(basePrice) || validateDiscountPercentage(discountPercentage)) {
    return null;
  }

  if (calculateSalePrice(basePrice, discountPercentage) >= MIN_PRICE) return null;

  return Number(discountPercentage) >= 100
    ? "A 100% discount would make this product free"
    : "That discount leaves the customer paying ₹0";
}

/** A dropdown that has to have been answered — category, say. */
export function validateChoice(value, label) {
  return String(value ?? "").trim() ? null : `${label} is required`;
}

// ============================================================
// VARIANTS  (backend/src/validators/product_variant.validator.js)
// ============================================================

/**
 * A stock count on one sellable row.
 *
 * A blank box means "leave it alone" rather than zero, matching the API —
 * an admin clearing the field to retype it has not just marked the size
 * sold out halfway through a keystroke.
 */
export function validateStock(value, label = "Stock") {
  if (value === undefined || value === null || value === "") return null;

  const stock = Number(value);

  if (Number.isNaN(stock)) return `${label} must be a number`;
  if (!Number.isInteger(stock)) return `${label} must be a whole number`;
  if (stock < 0) return `${label} cannot be negative`;

  return null;
}

export function validateSize(value, label = "Size") {
  const size = String(value ?? "").trim();

  if (!size) return `${label} is required`;
  if (size.length > 20) return `${label} must not exceed 20 characters`;

  return null;
}

export function validateColour(value, label = "Colour") {
  if (value === undefined || value === null || value === "") return null;

  if (String(value).trim().length > 40) {
    return `${label} must not exceed 40 characters`;
  }

  return null;
}

/**
 * The whole size matrix, as one sentence naming the first row at fault.
 *
 * A map keyed `variants.2.stockQuantity` is what the API returns and it is
 * useless to this form — the editor renders a grid, not a list of named
 * inputs, so there is nowhere for such a key to land. What the admin can
 * act on is which row: "Maroon 40: stock cannot be negative".
 *
 * @returns {string|null} the first problem, or null when every row is fine
 */
export function validateVariantRows(rows) {
  for (const row of rows ?? []) {
    const label = [row.colour, row.size].filter(Boolean).join(" ") || "A row";

    const problem =
      validateSize(row.size, `${label}: size`) ??
      validateColour(row.colour, `${label}: colour`) ??
      validateStock(row.stockQuantity, `${label}: stock`);

    if (problem) return problem;
  }

  return null;
}

// ============================================================
// UPLOADS
// ============================================================
//
// Deliberately absent. The multer limits — 5 MB, JPEG/PNG/WebP — are
// already checked by `rejectionReason` in lib/api/images.js, which every
// upload in the admin goes through, and a second copy of the same two
// numbers here is exactly the drift this file exists to avoid. Import
// that one.

// ============================================================
// SIZE CHARTS  (backend/src/config/size_chart.policy.js)
// ============================================================

export const MIN_MEASUREMENT = 1;
export const MAX_MEASUREMENT = 400;
export const MAX_SIZE_LABEL_LENGTH = 20;

/**
 * One measurement cell.
 *
 * Blank means "the shop states none for this size" and the storefront
 * prints a dash — a real thing to say, and the reason empty is allowed.
 *
 * Zero is not that. Zero is a number a shopper reads as a measurement, and
 * no garment has a nought-inch anything; a negative one is a typo with a
 * stray minus in it. Both were reaching the API, which refused them with
 * "Row 3 (40): waist must be between 1 and 400" — correct, and delivered
 * after the whole grid had been typed.
 */
export function validateMeasurement(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  if (!Number.isFinite(number)) return "must be a number";
  if (number === 0) return "cannot be 0 — leave it blank instead";
  if (number < MIN_MEASUREMENT || number > MAX_MEASUREMENT) {
    return `must be between ${MIN_MEASUREMENT} and ${MAX_MEASUREMENT}`;
  }

  return null;
}

export function validateSizeLabel(value, label = "A size label") {
  const size = String(value ?? "").trim();

  if (!size) return `${label} is required`;
  if (size.length > MAX_SIZE_LABEL_LENGTH) {
    return `${label} must not exceed ${MAX_SIZE_LABEL_LENGTH} characters`;
  }

  return null;
}

/**
 * A whole grid, checked against the columns it declares.
 *
 * Rows and columns are checked as a pair because neither means anything
 * alone: a row is valid only in terms of what the table says it holds, and
 * the message worth returning names the row, the size and the column.
 *
 * Returns the first problem rather than all of them. The grid is rendered
 * as a table of bare inputs with no room for a message under each cell, so
 * one precise sentence — "Row 3 (40): waist cannot be 0" — is what the
 * shop can actually act on.
 *
 * @returns {string|null}
 */
export function validateSizeChartRows(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "A chart needs at least one size row";
  }

  const measurements = Array.isArray(columns) ? columns.slice(1) : [];
  const seen = new Set();

  for (const [index, row] of rows.entries()) {
    const where = `Row ${index + 1}`;

    const size = String(row?.size ?? "").trim();

    // Worded as the API words it, so the same bad row reads the same
    // whether it was caught here or refused there.
    if (!size) return `${where} needs a size label`;

    if (size.length > MAX_SIZE_LABEL_LENGTH) {
      return `${where}: a size label must not exceed ${MAX_SIZE_LABEL_LENGTH} characters`;
    }

    // Two rows called "40" is a table nobody can read across, and the
    // storefront keys its rows by size when it prints them.
    const key = size.toLowerCase();
    if (seen.has(key)) return `${where}: '${size}' is listed twice`;
    seen.add(key);

    for (const column of measurements) {
      const problem = validateMeasurement(row[column]);

      if (problem) return `${where} (${size}): ${column} ${problem}`;
    }
  }

  return null;
}

/**
 * A measurement written as text, which is what the category size charts
 * hold — "82", or a range like "80–84".
 *
 * The range form is why these cells cannot simply be `type="number"`: the
 * shop transcribes a printed card, and the card says 80–84. Both halves
 * are checked, so "-5" and "0–84" are refused while "80–84" is not.
 *
 * Either dash is accepted. The shop types a hyphen; the card prints an
 * en dash; neither is worth an error message.
 */
export function validateMeasurementText(value, label = "Measurement") {
  const text = String(value ?? "").trim();

  if (!text) return null;

  // Caught before the split, because the split reads the minus as the
  // range separator: "-5" would come apart into ["", "5"] and be reported
  // as a malformed range rather than as the negative it is.
  if (/^[-–—]\s*\d/.test(text)) return `${label} cannot be negative`;

  const parts = text.split(/\s*[-–—]\s*/);

  if (parts.length > 2 || parts.some((part) => part === "")) {
    return `${label} must be a number, or a range like 80–84`;
  }

  for (const part of parts) {
    // Refused here rather than left to Number(), which reads "80cm" as
    // NaN but "80 " as 80 — one of those is a typo and one is not.
    if (!/^\d+(\.\d+)?$/.test(part)) {
      return `${label} must be a number, or a range like 80–84`;
    }

    const problem = validateMeasurement(part);
    if (problem) return `${label} ${problem}`;
  }

  if (parts.length === 2 && Number(parts[0]) >= Number(parts[1])) {
    return `${label} range must run low to high`;
  }

  return null;
}

// ============================================================
// REVIEWS  (backend/src/config/review.policy.js)
// ============================================================

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_AUTHOR_LENGTH = 120;
export const MAX_TITLE_LENGTH = 150;
export const MAX_BODY_LENGTH = 2000;

/**
 * One review as the admin composes it.
 *
 * `requireProduct` is false when editing, because a review cannot be moved
 * to another product and the form does not offer to — there is no field
 * whose absence would mean anything.
 *
 * The length checks look redundant next to the `maxLength` on each input,
 * and are kept because `maxLength` stops typing but not pasting in every
 * browser, and because a limit worth enforcing is worth stating.
 */
export function validateReviewFields(form, { requireProduct = false } = {}) {
  const rating = Number(form.rating);

  return collect([
    ["productId", requireProduct ? validateChoice(form.productId, "A product") : null],
    [
      "authorName",
      !String(form.authorName ?? "").trim()
        ? "A name to publish the review under is required"
        : String(form.authorName).trim().length > MAX_AUTHOR_LENGTH
          ? `Name cannot exceed ${MAX_AUTHOR_LENGTH} characters`
          : null,
    ],
    [
      "rating",
      Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING
        ? null
        : `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`,
    ],
    [
      "title",
      String(form.title ?? "").length > MAX_TITLE_LENGTH
        ? `Title cannot exceed ${MAX_TITLE_LENGTH} characters`
        : null,
    ],
    [
      "body",
      String(form.body ?? "").length > MAX_BODY_LENGTH
        ? `Review cannot exceed ${MAX_BODY_LENGTH} characters`
        : null,
    ],
  ]);
}

// ============================================================
// COMPOSING
// ============================================================

/**
 * Turns `[field, message]` pairs into a `{ field: message }` map, dropping
 * the fields that passed.
 *
 * Written this way round so a form lists its rules as a table that reads
 * top to bottom, rather than as a run of `if (error) errors.x = error`.
 */
export function collect(checks) {
  const errors = {};

  for (const [field, message] of checks) {
    if (message) errors[field] = message;
  }

  return errors;
}

export function hasErrors(errors) {
  return Boolean(errors) && Object.keys(errors).length > 0;
}

/** The first message in a map — what a single-line notice shows. */
export function firstError(errors) {
  const [field] = Object.keys(errors ?? {});

  return field ? errors[field] : null;
}

/**
 * "3 fields need fixing" — the detail line of a toast that cannot show
 * eight messages, put next to the messages themselves rather than
 * instead of them.
 */
export function summarizeErrors(errors) {
  const count = Object.keys(errors ?? {}).length;

  if (count === 0) return null;
  if (count === 1) return firstError(errors);

  return `${count} fields need fixing.`;
}
