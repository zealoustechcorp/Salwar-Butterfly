// src/routes/wishlist.routes.js
//
// Saved pieces (F-07).
//
// The one router in this project that can be blanket-guarded and means
// it: every endpoint is "my wishlist", so every endpoint needs a
// storefront token and none of them takes a customer id.
//
// `requireCustomer` rather than plain `authenticate`, and the difference
// matters. These handlers read `req.user.id` as a customer id; an admin
// token would send them looking for a customer row that does not exist,
// and the admin would end up with an empty wishlist of their own rather
// than an error. Admins have no wishlist, and this says so.

import express from "express";

import { WishlistController } from "../controllers/wishlist.controller.js";

import { authenticate } from "../middlewares/auth.middleware.js";
import { requireCustomer } from "../middlewares/authorize.middleware.js";

import {
  validateWishlistAdd,
  validateWishlistMerge,
  validateWishlistProductIdParam,
} from "../validators/wishlist.validator.js";

const router = express.Router();

// Applied at the mount rather than route by route: a router guarded here
// cannot grow an endpoint that forgets it.
router.use(authenticate, requireCustomer);

router.get("/getMyWishlist", WishlistController.getMine);

router.post("/addItem", validateWishlistAdd, WishlistController.add);

router.delete(
  "/removeItem/:productId",
  validateWishlistProductIdParam,
  WishlistController.remove,
);

router.post("/mergeWishlist", validateWishlistMerge, WishlistController.merge);

export default router;
