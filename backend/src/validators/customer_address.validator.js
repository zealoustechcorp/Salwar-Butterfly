// src/validators/customer_address.validator.js
//
// The address book (F-05.03, F-08.05). Shape checks only.
//
// The field rules come from address.rules.js, which checkout uses too.
// That is deliberate: an address the shopper is invited to save must be
// one they can then buy with, and two copies of these rules would drift
// until it was not.

import { ApiError } from "../utils/ApiError.js";
import { validateAddressFields } from "./address.rules.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const validateAddressIdParam = (req, res, next) => {
  const id = String(req.params?.id ?? "").trim();

  if (!UUID_REGEX.test(id)) {
    throw new ApiError(400, "Invalid address ID format");
  }

  req.params.id = id;

  next();
};

/**
 * The body of a create or a replace.
 *
 * `isDefault` is optional and only ever read as a boolean. What it means
 * when absent differs between the two — a new address may be forced to
 * default when it is the first, and an edit keeps whatever the address
 * already was — so the decision lives in the service rather than in a
 * default value here.
 *
 * Not accepted: `customerId`. Where an address belongs comes from the
 * token, never the body.
 */
export const validateAddressBody = (req, res, next) => {
  const body = req.body ?? {};

  const errors = validateAddressFields(body);

  if (body.isDefault !== undefined && typeof body.isDefault !== "boolean") {
    errors.isDefault = "isDefault must be true or false";
  }

  if (Object.keys(errors).length) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};
