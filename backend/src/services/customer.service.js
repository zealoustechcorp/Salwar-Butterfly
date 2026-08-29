// src/services/customer.service.js

import bcrypt from "bcrypt";

import { CreateCustomerDTO, UpdateCustomerDTO } from "../dto/customer.dto.js";

import { CustomerRepository } from "../repository/customer.repository.js";
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
          field: "email",
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
          field: "phone",
        });
      }

      // --------------------------------------------------------
      // HASH PASSWORD
      // --------------------------------------------------------

      const hashedPassword = await bcrypt.hash(dto.password, 12);

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

        throw new ApiError(409, "Email already registered", {
          field: "email",
        });
      }

      if (error.code === CUSTOMER_ERRORS.PHONE_EXISTS) {
        logger.warn("Customer registration failed: duplicate phone", {
          phone,
        });

        throw new ApiError(409, "Phone number already registered", {
          field: "phone",
        });
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

  async getAllCustomers({ page = 1, limit = 25 } = {}) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);

      const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);

      const customers = await CustomerRepository.findAll({
        page: safePage,
        limit: safeLimit,
      });

      logger.info("Customers fetched successfully", {
        count: customers.length,
        page: safePage,
        limit: safeLimit,
      });

      return CustomerMapper.toDTOList(customers);
    } catch (error) {
      logger.error("Unexpected error while fetching customers", {
        page,
        limit,
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
            field: "email",
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
            field: "phone",
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

      if (error.code === CUSTOMER_ERRORS.EMAIL_EXISTS) {
        throw new ApiError(409, "Email already in use", {
          field: "email",
        });
      }

      if (error.code === CUSTOMER_ERRORS.PHONE_EXISTS) {
        throw new ApiError(409, "Phone number already in use", {
          field: "phone",
        });
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

  async changePassword(id, oldPassword, newPassword) {
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

      const hashedPassword = await bcrypt.hash(newPassword, 12);

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

      logger.info("Customer password changed successfully", {
        customerId: id,
      });

      return true;
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
