// src/services/customer_address.service.js
//
// The address book (F-05.03, F-08.05).
//
// Every method takes a customer id that came from a token and never from
// a request body, the same rule the wishlist follows. There is no "whose
// address book" parameter anywhere in this feature, which is what makes
// it impossible to read or edit somebody else's by asking nicely.

import {
  ADDRESS_RULE,
  CustomerAddressRepository,
} from "../repository/customer_address.repository.js";
import { CustomerAddressMapper } from "../mapper/customer_address.mapper.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value, label) => {
  const id = String(value ?? "").trim();

  if (!UUID_RE.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, "INVALID_UUID");
  }

  return id;
};

/**
 * The most addresses one shopper may save (F-08.05).
 *
 * Three, from the FRS, and it is a real number rather than a round one:
 * home, work, and the parents' house is the shape of an Indian delivery
 * address book, and a picker with a dozen entries is slower to use at
 * checkout than typing the address again.
 *
 * Enforced here rather than in the schema — see the note at the foot of
 * 013_create_customer_addresses.sql for why, and note that this is the
 * only writer of that table.
 */
export const MAX_ADDRESSES = 3;

/** Trim to null, so an empty optional field is stored as absent. */
const optional = (value) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
};

/**
 * The row as it will be written.
 *
 * Shape only — every field was checked by address.validator.js before
 * this ran. What this adds is the defaulting: country falls back to
 * India because that is the only place the shop ships, and the caller
 * should not have to say so on every form.
 */
const toRow = (body, { isDefault }) => ({
  label: optional(body.label),
  line1: String(body.line1).trim(),
  line2: optional(body.line2),
  landmark: optional(body.landmark),
  city: String(body.city).trim(),
  state: String(body.state).trim(),
  postalCode: String(body.postalCode).trim(),
  country: optional(body.country) ?? "India",
  isDefault,
});

/**
 * The answer for a write the repository's transaction refused, or null
 * when the error is not one of the known outcomes.
 *
 * 23505 on uq_customer_addresses_one_default should be unreachable now
 * that every write holds the customer row (see lockOwner in the
 * repository), but if two writes ever do collide on it the truthful
 * answer is "try again", not a 500.
 */
const knownWriteError = (error) => {
  if (error?.addressRule === ADDRESS_RULE.LIMIT_REACHED) {
    return ApiError.conflict(
      `You can save up to ${MAX_ADDRESSES} addresses. ` +
        `Remove one to add another.`,
      "ADDRESS_LIMIT_REACHED",
    );
  }

  // A closed account whose access token has not lapsed yet (BUG-7). The
  // same answer /me gives, so the storefront signs the shopper out.
  if (error?.addressRule === ADDRESS_RULE.ACCOUNT_CLOSED) {
    return ApiError.unauthorized(
      "Your session is no longer valid",
      "SESSION_INVALID",
    );
  }

  if (error?.code === "23505") {
    return ApiError.conflict(
      "Your address book was changed at the same moment. Please try again.",
      "ADDRESS_CONFLICT",
    );
  }

  return null;
};

export const CustomerAddressService = {
  /** The shopper's saved addresses, default first. */
  async getMine(customerId) {
    try {
      const rows = await CustomerAddressRepository.listByCustomer(customerId);

      return CustomerAddressMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("CustomerAddressService.getMine failed", {
        customerId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to load your addresses");
    }
  },

  /**
   * Saves a new address.
   *
   * The first one a shopper saves becomes their default whatever they
   * asked for. An address book whose only entry is not the default is a
   * checkout that preselects nothing, and there is nothing for the
   * shopper to have preferred it over.
   */
  async create(customerId, body) {
    try {
      // The limit and the "first one is the default" rule are both
      // decided inside the repository's transaction, under a lock on the
      // customer row — a count taken here would be stale by the time the
      // insert landed (BUG-5).
      const row = await CustomerAddressRepository.create(
        customerId,
        toRow(body, { isDefault: Boolean(body.isDefault) }),
        { maxAddresses: MAX_ADDRESSES },
      );

      logger.info("Address saved", {
        customerId,
        addressId: row.id,
        isDefault: row.is_default,
      });

      return CustomerAddressMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const known = knownWriteError(error);
      if (known) throw known;

      // 23514: the pincode CHECK in 013. The validator already refused
      // this shape, so reaching here means the two disagree — worth a
      // 400 rather than a 500, and worth the log line saying so.
      if (error?.code === "23514") {
        logger.warn("Address rejected by a database constraint", {
          customerId,
          constraint: error?.constraint,
        });

        throw ApiError.badRequest("That address could not be saved");
      }

      logger.error("CustomerAddressService.create failed", {
        customerId,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to save the address");
    }
  },

  /**
   * Replaces an address.
   *
   * An address that is currently the default stays the default unless
   * the caller says otherwise, so that editing a typo in the house
   * number does not silently move the preselection somewhere else.
   */
  async update(customerId, addressId, body) {
    const id = assertUuid(addressId, "address ID");

    try {
      const existing = await CustomerAddressRepository.findById(customerId, id);

      if (!existing) {
        throw ApiError.notFound("Address not found", "ADDRESS_NOT_FOUND");
      }

      const isDefault =
        body.isDefault === undefined
          ? existing.is_default
          : Boolean(body.isDefault) || existing.is_default;

      const row = await CustomerAddressRepository.update(
        customerId,
        id,
        toRow(body, { isDefault }),
      );

      if (!row) {
        throw ApiError.notFound("Address not found", "ADDRESS_NOT_FOUND");
      }

      return CustomerAddressMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const known = knownWriteError(error);
      if (known) throw known;

      if (error?.code === "23514") {
        throw ApiError.badRequest("That address could not be saved");
      }

      logger.error("CustomerAddressService.update failed", {
        customerId,
        addressId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update the address");
    }
  },

  /** Moves the default flag onto one address. */
  async setDefault(customerId, addressId) {
    const id = assertUuid(addressId, "address ID");

    try {
      const row = await CustomerAddressRepository.setDefault(customerId, id);

      if (!row) {
        throw ApiError.notFound("Address not found", "ADDRESS_NOT_FOUND");
      }

      return CustomerAddressMapper.toDTO(row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const known = knownWriteError(error);
      if (known) throw known;

      logger.error("CustomerAddressService.setDefault failed", {
        customerId,
        addressId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to set the default address");
    }
  },

  /**
   * Removes an address.
   *
   * Not idempotent, unlike the wishlist's remove. A wishlist heart is a
   * toggle that gets double-tapped; this is a delete behind a
   * confirmation, and "that address is already gone" is worth telling
   * the shopper rather than swallowing.
   */
  async remove(customerId, addressId) {
    const id = assertUuid(addressId, "address ID");

    try {
      const removed = await CustomerAddressRepository.remove(customerId, id);

      if (!removed) {
        throw ApiError.notFound("Address not found", "ADDRESS_NOT_FOUND");
      }

      logger.info("Address removed", { customerId, addressId: id });

      return CustomerAddressService.getMine(customerId);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const known = knownWriteError(error);
      if (known) throw known;

      logger.error("CustomerAddressService.remove failed", {
        customerId,
        addressId: id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to remove the address");
    }
  },
};
