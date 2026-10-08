import { CustomerService } from "../services/customer.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

import {
  successResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
} from "../utils/apiResponse.js";

export const CustomerController = {
  // ============================================================
  // REGISTER CUSTOMER
  // ============================================================

  register: asyncHandler(async (req, res) => {
    try {
      const { name, email, phone, password } = req.body;

      // Validator middleware should normally catch this.
      // This is a defensive application-level check.
      if (!name || !email || !phone || !password) {
        logger.warn("Customer registration validation failed", {
          ip: req.ip,
          method: req.method,
          path: req.originalUrl,
        });

        throw new ApiError(400, "Name, email, phone and password are required");
      }

      const customer = await CustomerService.registerCustomer(
        name,
        email,
        phone,
        password,
      );

      logger.info("Customer registration request completed", {
        customerId: customer.id,
        ip: req.ip,
      });

      return createdResponse({
        res,
        data: customer,
        message: "Customer registered successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Customer registration controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to register customer");
    }
  }),

  // ============================================================
  // GET CUSTOMER BY ID
  // ============================================================

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      const customer = await CustomerService.getCustomerById(id);

      logger.info("Customer fetched successfully", {
        customerId: id,
        ip: req.ip,
      });

      return successResponse({
        res,
        data: customer,
        message: "Customer fetched successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Get customer controller error", {
        customerId: req.params.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to fetch customer");
    }
  }),

  // ============================================================
  // GET ALL CUSTOMERS
  // ============================================================

  getAll: asyncHandler(async (req, res) => {
    try {
      const { page, limit, search, sort } = req.query ?? {};

      const { customers, ...pagination } = await CustomerService.getAllCustomers(
        { page, limit, search, sort },
      );

      logger.info("Customers fetched successfully", {
        count: customers.length,
        total: pagination.total,
        ip: req.ip,
      });

      return paginatedResponse({
        res,
        data: customers,
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        message: "Customers fetched successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Get all customers controller error", {
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to fetch customers");
    }
  }),

  // ============================================================
  // UPDATE CUSTOMER
  // ============================================================

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone } = req.body;

      // Validator normally handles this.
      if (name === undefined && email === undefined && phone === undefined) {
        logger.warn("Customer update validation failed", {
          customerId: id,
          ip: req.ip,
        });

        throw new ApiError(400, "At least one field is required to update");
      }

      const customer = await CustomerService.updateCustomer(
        id,
        name,
        email,
        phone,
      );

      logger.info("Customer update request completed", {
        customerId: id,
        ip: req.ip,
      });

      return successResponse({
        res,
        data: customer,
        message: "Customer updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Update customer controller error", {
        customerId: req.params.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to update customer");
    }
  }),

  // ============================================================
  // DELETE CUSTOMER
  // ============================================================

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      await CustomerService.deleteCustomer(id);

      logger.info("Customer deletion request completed", {
        customerId: id,
        ip: req.ip,
      });

      return noContentResponse(res);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Delete customer controller error", {
        customerId: req.params.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to delete customer");
    }
  }),

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  changePassword: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { oldPassword, newPassword } = req.body;

      // Validator normally handles this.
      if (!oldPassword || !newPassword) {
        logger.warn("Password change validation failed", {
          customerId: id,
          ip: req.ip,
        });

        throw new ApiError(400, "Old password and new password are required");
      }

      const oldPasswordValue = oldPassword;
      const newPasswordValue = newPassword;

      await CustomerService.changePassword(
        id,
        oldPasswordValue,
        newPasswordValue,
      );

      logger.info("Customer password change request completed", {
        customerId: id,
        ip: req.ip,
      });

      return successResponse({
        res,
        data: null,
        message: "Password changed successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      logger.error("Change password controller error", {
        customerId: req.params.id,
        ip: req.ip,
        error: error.message,
        stack: error.stack,
      });

      throw new ApiError(500, "Failed to change password");
    }
  }),
};
