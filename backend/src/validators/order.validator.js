// src/validators/order.validator.js

import { ApiError } from "../utils/ApiError.js";

import {
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  ORDER_SORTS,
  ORDER_STATUS,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "../config/order.policy.js";

import {
  validateEmail,
  validateName,
  validatePhone,
} from "./customer.rules.js";

import {
  validateAddressFields,
  validateAddressText,
} from "./address.rules.js";

import { CUSTOMER_TOKEN_TYPE } from "../services/customer.auth.service.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_REGEX.test(String(value ?? "").trim());

/**
 * A free-text field, of the address or of anything else here.
 *
 * The rule moved to address.rules.js when the address book (F-05.03)
 * gave it a second caller. Aliased rather than renamed at every use
 * site because the notes and reasons below are not address lines and
 * read better under the old name.
 */
const textField = validateAddressText;

// ============================================================
// ORDER ID PARAM
// ============================================================

/**
 * Rejects a malformed id before it reaches Postgres.
 *
 * Without this a non-UUID comes back from the driver as a 22P02, which
 * surfaces as a 500 — an invalid id in the URL is the caller's mistake
 * and should read as one.
 */
export const validateOrderIdParam = (req, res, next) => {
  const id = req.params?.id;

  if (!isUuid(id)) {
    throw new ApiError(400, "Invalid order ID format");
  }

  req.params.id = String(id).trim();

  next();
};

// ============================================================
// PLACE AN ORDER
// ============================================================

/**
 * The checkout payload (F-07.01).
 *
 * Note what is *not* accepted here: no prices, no totals, no product
 * names. A line is a variant id and a quantity, and everything else is
 * read from the database when the order is written. A client that could
 * send a price could send its own, and no amount of checking a
 * submitted total against a recomputed one is as safe as never
 * accepting one.
 *
 * Nor is `customerId` accepted. Where an order belongs comes from the
 * token, never the body — otherwise a signed-in shopper could file an
 * order under somebody else's account.
 */
export const validateCreateOrder = (req, res, next) => {
  const { contact, shippingAddress, items, customerNote, whatsappOptIn } = req.body ?? {};

  const errors = {};

  // ----------------------------------------------------------
  // CONTACT
  // ----------------------------------------------------------
  //
  // Required whether or not the caller is signed in. A guest has no
  // account to read it from, and a signed-in shopper may well want this
  // parcel to reach somebody else — a gift goes to a different name and
  // number than the one on the account.

  if (!contact || typeof contact !== "object") {
    errors.contact = "Contact details are required";
  } else {
    const nameError = validateName(contact.name, true);
    if (nameError) errors["contact.name"] = nameError;

    const emailError = validateEmail(contact.email, true);
    if (emailError) errors["contact.email"] = emailError;

    const phoneError = validatePhone(contact.phone, true);
    if (phoneError) errors["contact.phone"] = phoneError;
  }

  // ----------------------------------------------------------
  // SHIPPING ADDRESS
  // ----------------------------------------------------------

  // The same field rules the address book applies, so that an address a
  // shopper saved to their account cannot be refused when they try to
  // buy something with it.

  if (!shippingAddress || typeof shippingAddress !== "object") {
    errors.shippingAddress = "A shipping address is required";
  } else {
    Object.assign(
      errors,
      validateAddressFields(shippingAddress, { prefix: "shippingAddress" }),
    );
  }

  // ----------------------------------------------------------
  // LINES
  // ----------------------------------------------------------

  if (!Array.isArray(items) || items.length === 0) {
    errors.items = "An order must have at least one item";
  } else if (items.length > MAX_ORDER_LINES) {
    // Shopper-facing wording, because this is now a shop rule (F-07.01)
    // rather than only a guard against scripted requests. A bag that
    // reaches here over the limit was not built by the storefront —
    // StoreProvider stops the sixteenth line — so it is either an old
    // bag from before this cap or a direct call.
    errors.items =
      `A bag may hold up to ${MAX_ORDER_LINES} pieces, counting each size ` +
      `separately. Remove a few and place the rest as a second order.`;
  } else {
    const seen = new Set();

    items.forEach((item, index) => {
      const label = `items[${index}]`;

      if (!item || typeof item !== "object") {
        errors[label] = "Each item must be an object";
        return;
      }

      const variantId = String(item.variantId ?? "").trim();

      if (!isUuid(variantId)) {
        errors[`${label}.variantId`] = "Invalid variant ID format";
      } else if (seen.has(variantId.toLowerCase())) {
        // Two lines for the same size would both insert and violate
        // uq_order_items_order_variant deep inside the checkout
        // transaction. Caught here, it reads as the caller's bug rather
        // than a failed order.
        errors[`${label}.variantId`] = "This size is listed more than once";
      } else {
        seen.add(variantId.toLowerCase());
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity)) {
        errors[`${label}.quantity`] = "Quantity must be a whole number";
      } else if (quantity < 1) {
        errors[`${label}.quantity`] = "Quantity must be at least 1";
      } else if (quantity > MAX_LINE_QUANTITY) {
        errors[`${label}.quantity`] =
          `Quantity must not exceed ${MAX_LINE_QUANTITY}`;
      }
    });
  }

  // ----------------------------------------------------------
  // NOTE
  // ----------------------------------------------------------

  const noteError = textField(customerNote, "Note", {
    required: false,
    max: 1000,
  });

  if (noteError) errors.customerNote = noteError;

  // ----------------------------------------------------------
  // WHATSAPP OPT-IN
  // ----------------------------------------------------------
  //
  // Optional, and a strict boolean when present. Absent means the
  // storefront did not send it — an older client, or a caller that is
  // not the storefront at all — and the column's own DEFAULT TRUE then
  // decides, matching the ticked box a shopper would have seen.
  //
  // Refused rather than coerced, because the truthiness of "false" is
  // exactly the bug that would silently message somebody who opted out.

  if (whatsappOptIn !== undefined && typeof whatsappOptIn !== "boolean") {
    errors.whatsappOptIn = "WhatsApp preference must be true or false";
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};

// ============================================================
// ORDER LIST QUERY
// ============================================================

/**
 * Shape checks for both list screens.
 *
 * The clamping happens in OrderService, so a caller asking for page 0
 * is corrected rather than refused. What is refused is a request that
 * cannot be honestly answered — a limit above the cap would be silently
 * reduced, and a screen that asked for 500 rows and got 100 without
 * being told has no way to know it is showing a partial list.
 */
export const validateOrderQuery = (req, res, next) => {
  const { page, limit, search, sort, status, paymentStatus } = req.query ?? {};

  const errors = {};

  if (page !== undefined && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
    errors.page = "Page must be a positive whole number";
  }

  if (limit !== undefined) {
    if (!Number.isInteger(Number(limit)) || Number(limit) < 1) {
      errors.limit = "Limit must be a positive whole number";
    } else if (Number(limit) > MAX_PAGE_SIZE) {
      errors.limit = `Limit must not exceed ${MAX_PAGE_SIZE}`;
    }
  }

  if (search !== undefined) {
    if (typeof search !== "string") {
      errors.search = "Search must be a string";
    } else if (search.length > MAX_SEARCH_LENGTH) {
      errors.search = `Search must not exceed ${MAX_SEARCH_LENGTH} characters`;
    }
  }

  if (sort !== undefined && !ORDER_SORTS.includes(sort)) {
    errors.sort = `Unknown sort. Expected one of: ${ORDER_SORTS.join(", ")}.`;
  }

  if (status !== undefined && !ORDER_STATUSES.includes(status)) {
    errors.status = `Unknown status. Expected one of: ${ORDER_STATUSES.join(", ")}.`;
  }

  if (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus)) {
    errors.paymentStatus = `Unknown payment status. Expected one of: ${PAYMENT_STATUSES.join(", ")}.`;
  }

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};

// ============================================================
// STATUS CHANGE
// ============================================================

/**
 * Whether the requested status is a status at all.
 *
 * Whether it is a legal *move* from where the order currently sits is
 * OrderService's question — answering it needs the order, which this
 * middleware does not have and should not fetch.
 *
 * Two of the six statuses are refused here, because reaching them
 * through this route would do only half of what they mean:
 *
 *   cancelled   also returns stock to the shelf, in the same
 *               transaction. Setting the column alone would leave the
 *               shop unable to sell pieces it is holding.
 *
 *   confirmed   also means the money arrived, and moves
 *               `payment_status` with it. Setting the column alone
 *               would produce an order that is confirmed and unpaid —
 *               the shop would pack and ship it for nothing.
 *
 * Each has its own endpoint that does the whole job.
 */
export const validateStatusChange = (req, res, next) => {
  const { status, note } = req.body ?? {};

  const errors = {};

  if (status === undefined || status === null || status === "") {
    errors.status = "Status is required";
  } else if (!ORDER_STATUSES.includes(status)) {
    errors.status = `Unknown status. Expected one of: ${ORDER_STATUSES.join(", ")}.`;
  } else if (status === ORDER_STATUS.CANCELLED) {
    errors.status = "Use the cancel endpoint to cancel an order";
  } else if (status === ORDER_STATUS.CONFIRMED) {
    errors.status =
      "Use the confirm-payment endpoint — confirming an order records the payment with it";
  } else if (status === ORDER_STATUS.PENDING_PAYMENT) {
    errors.status = "An order cannot be moved back to awaiting payment";
  }

  const noteError = textField(note, "Note", { required: false, max: 1000 });
  if (noteError) errors.note = noteError;

  if (Object.keys(errors).length > 0) {
    throw new ApiError(400, "Validation failed", errors);
  }

  next();
};

// ============================================================
// CANCELLATION
// ============================================================

/**
 * The reason is required from an admin and optional from a shopper.
 *
 * A shopper who changes their mind owes nobody an explanation. An admin
 * cancelling somebody else's order is making a decision the customer
 * will ask about, and "cancelled, no reason recorded" is not an answer
 * the shop can give them a week later.
 */
export const validateCancelOrder = (req, res, next) => {
  const { reason } = req.body ?? {};

  const required = req.user?.typ !== CUSTOMER_TOKEN_TYPE;

  const error = textField(reason, "Cancellation reason", {
    required,
    max: 1000,
  });

  if (error) {
    throw new ApiError(400, "Validation failed", { reason: error });
  }

  next();
};

// ============================================================
// PAYMENT CONFIRMATION
// ============================================================

/**
 * Confirming payment by hand, until a gateway lands (step 3 of F-07).
 *
 * `reference` is whatever identifies the money — a UPI transaction id, a
 * bank reference. Optional, because the shop may be looking at a
 * screenshot, but recorded when given: it is the only thread back from
 * an order to the transfer that paid for it.
 */
export const validateConfirmPayment = (req, res, next) => {
  const { reference } = req.body ?? {};

  const error = textField(reference, "Payment reference", {
    required: false,
    max: 255,
  });

  if (error) {
    throw new ApiError(400, "Validation failed", { reference: error });
  }

  next();
};
