// src/routes/customer.routes.js

import express from "express";

import { CustomerController } from "../controllers/customer.controller.js";

import {
  validateCreateCustomer,
  validateUpdateCustomer,
  validateChangePassword,
} from "../validators/customer.validator.js";

const router = express.Router();

// Register customer
router.post("/register", validateCreateCustomer, CustomerController.register);

// Get all customers
router.get("/getAllCustomers", CustomerController.getAll);

// Get customer by ID
router.get("/getCustomerById/:id", CustomerController.getById);

// Update customer
router.put(
  "/updateCustomer/:id",
  validateUpdateCustomer,
  CustomerController.update,
);

// Delete customer
router.delete("/deleteCustomer/:id", CustomerController.delete);

// Change password
router.post(
  "/:id/change-password",
  validateChangePassword,
  CustomerController.changePassword,
);

export default router;
