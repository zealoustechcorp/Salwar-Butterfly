// src/services/customer.service.js

import bcrypt from "bcrypt";

import { CreateCustomerDTO, UpdateCustomerDTO } from "../dto/customer.dto.js";

import {
  clampPagination,
  CUSTOMER_SORTS,
  DEFAULT_SORT,
} from "../config/customer.query.js";

import { CustomerRepository } from "../repository/customer.repository.js";
import { RefreshTokenRepository } from "../repository/refresh_token.repository.js";
import { AUTH_AUDIENCE, REVOKE_REASON } from "../config/auth.policy.js";
import { CustomerMapper } from "../mapper/customer.mapper.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// ============================================================
// REPOSITORY ERROR CODES
// ============================================================

const CUSTOMER_ERRORS = Object.freeze({
  EMAIL_EXISTS: "CUSTOMER_EMAIL_EXISTS",
  PHONE_EXISTS: "CUSTOMER_PHONE_EXISTS",
});

const BCRYPT_COST = 12;

// ============================================================
// UNIQUENESS CONFLICTS
// ============================================================

/**
 * What to say when a closed account is the one holding the value.
 *
 * On the live schema email and phone are plain UNIQUE, not partial on
 * deleted_at, so a soft-deleted row keeps its address and number for
 * good: the "is it taken?" pre-checks (which only look at live accounts)
 * pass, and the INSERT or UPDATE is then refused by Postgres. "Already
 * registered" would be untrue from the shopper's side — they cannot sign
 * in to it — so this says what actually happened and what to do about
 * it. Once 026_customers_partial_unique.sql has run, closing an account
 * frees its email and phone and this path stops being reachable.
 */
const CLOSED_ACCOUNT_MESSAGE = Object.freeze({
  email:
    "This email belonged to a closed account. Use a different email, " +
    "or contact the shop to reopen that account.",
  phone:
    "This phone number belonged to a closed account. Use a different " +
    "number, or contact the shop to reopen that account.",
});

/**
 * The 409 for a unique violation the database raised, with a field map.
 *
 * Asks whether the holder is a closed account only on this error path,
 * so the happy path pays nothing for it; if that lookup itself fails the
 * generic message is still a correct 409.
 */
const duplicateConflict = async (field, value, liveMessage) => {
  let closed = false;

  try {
    closed = await CustomerRepository.isHeldByClosedAccount(field, value);
  } catch {
    // Fall through to the generic message.
  }

  const message = closed ? CLOSED_ACCOUNT_MESSAGE[field] : liveMessage;

  return new ApiError({
    statusCode: 409,
    message,
    code: closed
      ? `CUSTOMER_${field.toUpperCase()}_CLOSED_ACCOUNT`
      : `CUSTOMER_${field.toUpperCase()}_EXISTS`,
    errors: { [field]: message },
  });
};

// ============================================================
// CUSTOMER SERVICE
// ============================================================

export const CustomerService = {
  // ============================================================
  // REGISTER CUSTOMER
  // ============================================================

  async registerCustomer(name, email, phone, password) {
    try {
      // --------------------------------------------------------
      // DTO
      // Route validator performs request validation.
      // DTO performs normalization.
      // --------------------------------------------------------

      const dto = new CreateCustomerDTO(name, email, phone, password);

      // --------------------------------------------------------
      // BUSINESS RULE
      // Check email uniqueness
      // --------------------------------------------------------

      const existingEmail = await CustomerRepository.findByEmail(dto.email);

      if (existingEmail) {
        logger.warn("Customer registration failed: email already exists", {
          email: dto.email,
        });

        throw new ApiError(409, "Email already registered", {
          email: "Email already registered",
        });
      }

      // --------------------------------------------------------
      // BUSINESS RULE
      // Check phone uniqueness
      // --------------------------------------------------------

      const existingPhone = await CustomerRepository.findByPhone(dto.phone);

      if (existingPhone) {
        logger.warn("Customer registration failed: phone already exists", {
          phone: dto.phone,
        });

        throw new ApiError(409, "Phone number already registered", {
          phone: "Phone number already registered",
        });
      }

      // --------------------------------------------------------
      // HASH PASSWORD
      // --------------------------------------------------------

      const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST);

      // --------------------------------------------------------
      // CREATE CUSTOMER
      // --------------------------------------------------------

      const customer = await CustomerRepository.save(
        dto.name,
        dto.email,
        dto.phone,
        hashedPassword,
      );

      if (!customer) {
        logger.error("Customer creation returned no result", {
          email: dto.email,
        });

        throw new ApiError(500, "Failed to create customer");
      }

      logger.info("Customer registered successfully", {
        customerId: customer.id,
      });

      return CustomerMapper.toDTO(customer);
    } catch (error) {
      // --------------------------------------------------------
      // KNOWN APPLICATION ERROR
      // --------------------------------------------------------

      if (error instanceof ApiError) {
        throw error;
      }

      // --------------------------------------------------------
      // DATABASE BUSINESS ERRORS
      // Handles race conditions where two requests
      // attempt to create the same email/phone simultaneously.
      // --------------------------------------------------------

      if (error.code === CUSTOMER_ERRORS.EMAIL_EXISTS) {
        logger.warn("Customer registration failed: duplicate email", {
          email,
        });

        throw await duplicateConflict(
          "email",
          String(email ?? "").trim().toLowerCase(),
          "Email already registered",
        );
      }

      if (error.code === CUSTOMER_ERRORS.PHONE_EXISTS) {
        logger.warn("Customer registration failed: duplicate phone", {
          phone,
        });

        throw await duplicateConflict(
          "phone",
          String(phone ?? "").trim(),
          "Phone number already registered",
        );
      }

      // --------------------------------------------------------
      // UNEXPECTED ERROR
      // --------------------------------------------------------

      logger.error("Unexpected error while registering customer", {
        email,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to register customer");
    }
  },

  // ============================================================
  // GET CUSTOMER BY ID
  // ============================================================

  async getCustomerById(id) {
    try {
      const customer = await CustomerRepository.findById(id);

      if (!customer) {
        logger.warn("Customer not found", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      logger.info("Customer fetched successfully", {
        customerId: id,
      });

      return CustomerMapper.toDTO(customer);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Unexpected error while fetching customer", {
        customerId: id,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to fetch customer");
    }
  },

  // ============================================================
  // GET ALL CUSTOMERS
  // ============================================================

  /**
   * A page of customers, with the total the filter matched beside it.
   *
   * Returns the count as well as the rows because the admin list has to
   * draw its pager before it knows how many pages there are — and the
   * total describes every match, not the twenty-five on this page.
   *
   * @returns {Promise<{customers: Array, page: number, limit: number, total: number}>}
   */
  async getAllCustomers({ page, limit, search = "", sort = DEFAULT_SORT } = {}) {
    const { page: safePage, limit: safeLimit } = clampPagination({
      page,
      limit,
    });

    const term = String(search ?? "").trim();

    const safeSort = CUSTOMER_SORTS.includes(sort) ? sort : DEFAULT_SORT;

    try {
      // Rows and total together — one is meaningless without the other,
      // and they must be read under the same filter.
      const [customers, total] = await Promise.all([
        CustomerRepository.findAll({
          page: safePage,
          limit: safeLimit,
          search: term,
          sort: safeSort,
        }),
        CustomerRepository.countAll({ search: term }),
      ]);

      logger.info("Customers fetched successfully", {
        count: customers.length,
        total,
        page: safePage,
        limit: safeLimit,
        sort: safeSort,
        searched: Boolean(term),
      });

      return {
        customers: CustomerMapper.toDTOList(customers),
        page: safePage,
        limit: safeLimit,
        total,
      };
    } catch (error) {
      logger.error("Unexpected error while fetching customers", {
        page: safePage,
        limit: safeLimit,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to fetch customers");
    }
  },

  // ============================================================
  // UPDATE CUSTOMER
  // ============================================================

  async updateCustomer(id, name, email, phone) {
    try {
      // --------------------------------------------------------
      // DTO NORMALIZATION
      // --------------------------------------------------------

      const dto = new UpdateCustomerDTO(name, email, phone);

      // --------------------------------------------------------
      // FIND EXISTING CUSTOMER
      // --------------------------------------------------------

      const existingCustomer = await CustomerRepository.findById(id);

      if (!existingCustomer) {
        logger.warn("Customer update failed: customer not found", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      // --------------------------------------------------------
      // EMAIL BUSINESS RULE
      // --------------------------------------------------------

      if (dto.email !== undefined && dto.email !== existingCustomer.email) {
        const emailExists = await CustomerRepository.findByEmail(dto.email);

        if (emailExists && emailExists.id !== id) {
          logger.warn("Customer update failed: email already exists", {
            customerId: id,
            email: dto.email,
          });

          throw new ApiError(409, "Email already in use", {
          email: "Email already in use",
        });
        }
      }

      // --------------------------------------------------------
      // PHONE BUSINESS RULE
      // --------------------------------------------------------

      if (dto.phone !== undefined && dto.phone !== existingCustomer.phone) {
        const phoneExists = await CustomerRepository.findByPhone(dto.phone);

        if (phoneExists && phoneExists.id !== id) {
          logger.warn("Customer update failed: phone already exists", {
            customerId: id,
            phone: dto.phone,
          });

          throw new ApiError(409, "Phone number already in use", {
          phone: "Phone number already in use",
        });
        }
      }

      // --------------------------------------------------------
      // PRESERVE EXISTING VALUES
      // --------------------------------------------------------

      const updateData = {
        name: dto.name !== undefined ? dto.name : existingCustomer.name,

        email: dto.email !== undefined ? dto.email : existingCustomer.email,

        phone: dto.phone !== undefined ? dto.phone : existingCustomer.phone,
      };

      // --------------------------------------------------------
      // UPDATE
      // --------------------------------------------------------

      const updatedCustomer = await CustomerRepository.update(
        id,
        updateData.name,
        updateData.email,
        updateData.phone,
      );

      if (!updatedCustomer) {
        logger.warn("Customer update failed: customer no longer exists", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      logger.info("Customer updated successfully", {
        customerId: id,
      });

      return CustomerMapper.toDTO(updatedCustomer);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // --------------------------------------------------------
      // DATABASE BUSINESS ERRORS
      // --------------------------------------------------------

      // Reached when the pre-checks above passed and Postgres still
      // refused: a concurrent edit took the value first, or (on the live
      // plain-UNIQUE schema) a closed account is holding it.
      if (error.code === CUSTOMER_ERRORS.EMAIL_EXISTS) {
        throw await duplicateConflict(
          "email",
          String(email ?? "").trim().toLowerCase(),
          "Email already in use",
        );
      }

      if (error.code === CUSTOMER_ERRORS.PHONE_EXISTS) {
        throw await duplicateConflict(
          "phone",
          String(phone ?? "").trim(),
          "Phone number already in use",
        );
      }

      // --------------------------------------------------------
      // UNEXPECTED ERROR
      // --------------------------------------------------------

      logger.error("Unexpected error while updating customer", {
        customerId: id,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to update customer");
    }
  },

  // ============================================================
  // DELETE CUSTOMER
  // ============================================================

  async deleteCustomer(id) {
    try {
      const existingCustomer = await CustomerRepository.findById(id);

      if (!existingCustomer) {
        logger.warn("Customer deletion failed: customer not found", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      const deletedCustomer = await CustomerRepository.softDelete(id);

      if (!deletedCustomer) {
        logger.warn("Customer deletion failed: customer not found", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      logger.info("Customer deleted successfully", {
        customerId: id,
      });

      return {
        id: deletedCustomer.id,
        deletedAt: deletedCustomer.deleted_at,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Unexpected error while deleting customer", {
        customerId: id,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to delete customer");
    }
  },

  // ============================================================
  // VERIFY PASSWORD
  // ============================================================

  async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      logger.error("Password verification failed", {
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Password verification failed");
    }
  },

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  /**
   * Change the password of a signed-in shopper (F-05.06).
   *
   * Ends every *other* session the account has, the way a reset by
   * email ends all of them (BUG-6, 2026-10-09). Changing a password is
   * what somebody does when they suspect it is known — leaving a
   * stranger's session renewing for thirty days afterwards defeats it.
   *
   * The caller's own session survives when it can be identified:
   * `currentFamilyId` is the `fam` claim of the access token that made
   * this request (the refresh cookie is path-scoped to /customers/auth
   * and never reaches this route). A token minted before that claim
   * existed carries none, and then every session is revoked, the
   * caller's included — their access token works until it lapses
   * (≤ 15 min) and the next renewal asks them to sign in again. Failing
   * closed is the right direction for a security action.
   *
   * @param {object} [options]
   * @param {string|null} [options.currentFamilyId]
   * @returns {Promise<{sessionsRevoked: number, keptCurrentSession: boolean}>}
   */
  async changePassword(id, oldPassword, newPassword, { currentFamilyId = null } = {}) {
    try {
      // --------------------------------------------------------
      // FIND CUSTOMER INCLUDING PASSWORD
      // --------------------------------------------------------

      const customer = await CustomerRepository.findByIdForAuth(id);

      if (!customer) {
        logger.warn("Password change failed: customer not found", {
          customerId: id,
        });

        throw new ApiError(404, "Customer not found");
      }

      // --------------------------------------------------------
      // VERIFY CURRENT PASSWORD
      // --------------------------------------------------------

      const validPassword = await this.verifyPassword(
        oldPassword,
        customer.password,
      );

      if (!validPassword) {
        logger.warn("Password change failed: invalid current password", {
          customerId: id,
        });

        throw new ApiError(401, "Invalid current password");
      }

      // --------------------------------------------------------
      // HASH NEW PASSWORD
      // --------------------------------------------------------

      const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

      // --------------------------------------------------------
      // UPDATE PASSWORD
      // --------------------------------------------------------

      const updatedCustomer = await CustomerRepository.updatePassword(
        id,
        hashedPassword,
      );

      if (!updatedCustomer) {
        throw new ApiError(404, "Customer not found");
      }

      // --------------------------------------------------------
      // END THE OTHER SESSIONS
      // --------------------------------------------------------
      //
      // After the password is written, and not allowed to undo it: the
      // shopper asked for a new password and has one. A failure here
      // is logged loudly instead, matching PasswordResetService.
      //
      // --------------------------------------------------------

      let sessionsRevoked = 0;

      try {
        sessionsRevoked = await RefreshTokenRepository.revokeAllForSubject(
          id,
          AUTH_AUDIENCE.CUSTOMER,
          REVOKE_REASON.PASSWORD_CHANGE,
          { exceptFamilyId: currentFamilyId },
        );
      } catch (revokeError) {
        logger.error("Password change: could not revoke other sessions", {
          customerId: id,
          error: revokeError?.message,
        });
      }

      logger.info("Customer password changed successfully", {
        customerId: id,
        sessionsRevoked,
        keptCurrentSession: Boolean(currentFamilyId),
      });

      return {
        sessionsRevoked,
        keptCurrentSession: Boolean(currentFamilyId),
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Unexpected error while changing password", {
        customerId: id,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to change password");
    }
  },
};
