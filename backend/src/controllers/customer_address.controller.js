// src/controllers/customer_address.controller.js
//
// The address book (F-05.03, F-08.05).
//
// Every method reads the customer id off the token and passes it down.
// There is no path through this controller by which one shopper can name
// another, which is the whole of this feature's authorization.

import { CustomerAddressService } from "../services/customer_address.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse, createdResponse } from "../utils/apiResponse.js";

const list = (res, addresses, message) =>
  okResponse({
    res,
    data: addresses,
    message,
    meta: { count: addresses.length },
  });

export const CustomerAddressController = {
  /** GET /api/addresses/getMyAddresses */
  getMine: asyncHandler(async (req, res) => {
    const addresses = await CustomerAddressService.getMine(req.user.id);

    return list(res, addresses, "Addresses fetched successfully");
  }),

  /**
   * POST /api/addresses/addAddress
   *
   * Returns the one address rather than the whole book, unlike the
   * wishlist next door. The caller is a form that needs the new id back
   * to select it at checkout, and it already holds the rest.
   */
  create: asyncHandler(async (req, res) => {
    const address = await CustomerAddressService.create(req.user.id, req.body);

    return createdResponse({
      res,
      data: address,
      message: "Address saved successfully",
    });
  }),

  /** PUT /api/addresses/updateAddress/:id */
  update: asyncHandler(async (req, res) => {
    const address = await CustomerAddressService.update(
      req.user.id,
      req.params.id,
      req.body,
    );

    return okResponse({
      res,
      data: address,
      message: "Address updated successfully",
    });
  }),

  /** PATCH /api/addresses/setDefaultAddress/:id */
  setDefault: asyncHandler(async (req, res) => {
    const address = await CustomerAddressService.setDefault(
      req.user.id,
      req.params.id,
    );

    return okResponse({
      res,
      data: address,
      message: "Default address updated successfully",
    });
  }),

  /**
   * DELETE /api/addresses/deleteAddress/:id
   *
   * Returns the remaining addresses, because deleting one can move the
   * default onto another (see the repository) and a client applying a
   * delta locally would not know which.
   */
  remove: asyncHandler(async (req, res) => {
    const addresses = await CustomerAddressService.remove(
      req.user.id,
      req.params.id,
    );

    return list(res, addresses, "Address removed successfully");
  }),
};
