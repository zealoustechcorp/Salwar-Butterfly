// src/routes/customer_address.routes.js
//
// The address book (F-05.03, F-08.05).
//
// Blanket-guarded, like the wishlist and for the same reason: every
// endpoint is "my addresses", every one of them reads the customer id
// off the token, and none of them takes one in a path or a body.
//
// `requireCustomer` rather than plain `authenticate`. These handlers
// read `req.user.id` as a customer id; an admin token would send them
// looking for a customer row that does not exist, and the admin would
// end up with an empty address book of their own rather than an error.
// Admins do not have delivery addresses, and this says so.

import express from "express";

import { CustomerAddressController } from "../controllers/customer_address.controller.js";

import { authenticate } from "../middlewares/auth.middleware.js";
import { requireCustomer } from "../middlewares/authorize.middleware.js";

import {
  validateAddressBody,
  validateAddressIdParam,
} from "../validators/customer_address.validator.js";

const router = express.Router();

// Applied at the mount rather than route by route: a router guarded here
// cannot grow an endpoint that forgets it.
router.use(authenticate, requireCustomer);

router.get("/getMyAddresses", CustomerAddressController.getMine);

router.post("/addAddress", validateAddressBody, CustomerAddressController.create);

router.put(
  "/updateAddress/:id",
  validateAddressIdParam,
  validateAddressBody,
  CustomerAddressController.update,
);

router.patch(
  "/setDefaultAddress/:id",
  validateAddressIdParam,
  CustomerAddressController.setDefault,
);

router.delete(
  "/deleteAddress/:id",
  validateAddressIdParam,
  CustomerAddressController.remove,
);

export default router;
