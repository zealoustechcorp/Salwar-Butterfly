// src/validators/address.rules.js

/**
 * Shared delivery-address validation rules (F-05.03, F-08.05).
 *
 * Like customer.rules.js, this file contains ONLY validation logic. It
 * knows nothing about Express, req, res or next.
 *
 * It exists because an address is now written down two paths — checkout
 * (order.validator.js) and the address book (address.validator.js) — and
 * two copies of these rules would drift. A saved address that the
 * address book accepts and checkout then rejects is a shopper who cannot
 * buy anything with the address they were invited to save.
 */

/** Six digits, not starting at zero — the Indian PIN format. */
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

/**
 * A free-text field of the address.
 *
 * Deliberately loose on what it accepts. An address line is whatever the
 * postal system will carry, and every character class an over-eager
 * validator rejects is a house somebody actually lives in. What it does
 * check is that something is there and that it is not long enough to be
 * an attack on the column width.
 */
export const validateAddressText = (
  value,
  label,
  { required = true, max = 255 } = {},
) => {
  if (value === undefined || value === null) {
    return required ? `${label} is required` : null;
  }

  if (typeof value !== "string") {
    return `${label} must be a string`;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return required ? `${label} is required` : null;
  }

  if (trimmed.length > max) {
    return `${label} must not exceed ${max} characters`;
  }

  return null;
};

/**
 * The pincode.
 *
 * The shop ships within India only, so the format is knowable and worth
 * checking — a wrong pincode is a parcel that goes to the wrong sorting
 * hub and comes back three weeks later.
 */
export const validatePostalCode = (value, required = true) => {
  const postalCode = String(value ?? "").trim();

  if (!postalCode) {
    return required ? "PIN code is required" : null;
  }

  if (!PINCODE_REGEX.test(postalCode)) {
    return "PIN code must be 6 digits";
  }

  return null;
};

/**
 * Every field of one address, as `{ field: message }`.
 *
 * Returns an empty object when the address is fine, so a caller can
 * spread it into a wider error map. `prefix` is what checkout passes to
 * get `shippingAddress.city` rather than a bare `city`, since its
 * payload carries contact details and order lines under the same map.
 *
 * The widths repeat 013_create_customer_addresses.sql and the
 * `orders.shipping_*` columns in 008. Those two agree with each other by
 * design; this agrees with both.
 */
export const validateAddressFields = (address, { prefix = "" } = {}) => {
  const errors = {};

  const key = (field) => (prefix ? `${prefix}.${field}` : field);

  const checks = [
    ["label", validateAddressText(address?.label, "Label", { required: false, max: 40 })],
    ["line1", validateAddressText(address?.line1, "Address line 1")],
    ["line2", validateAddressText(address?.line2, "Address line 2", { required: false })],
    ["landmark", validateAddressText(address?.landmark, "Landmark", { required: false })],
    ["city", validateAddressText(address?.city, "City", { max: 120 })],
    ["state", validateAddressText(address?.state, "State", { max: 120 })],
    ["country", validateAddressText(address?.country, "Country", { required: false, max: 80 })],
    ["postalCode", validatePostalCode(address?.postalCode)],
  ];

  for (const [field, error] of checks) {
    if (error) errors[key(field)] = error;
  }

  return errors;
};
