// src/routes/review.routes.js
//
// Reviews and ratings (F-11.06).
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// That is not a temporary state pending a storefront: the FRS puts this
// feature on an admin-only page because the shop publishes what
// customers tell it on WhatsApp and on the phone. There is no shopper
// write path to build, so there is none to leave a door open for.
//
// The public read that will eventually show these on a product page
// (F-06.08) belongs in storefront.routes.js when it is built — the
// GET-only router whose columns are named one at a time — and not here,
// where opening a read would sit alongside four writes.

import express from "express";

import { ReviewController } from "../controllers/review.controller.js";
import {
  validateCreateReview,
  validateReviewIdParam,
  validateReviewQuery,
  validateSetPublished,
  validateUpdateReview,
} from "../validators/review.validator.js";

const router = express.Router();

// The list: filtered by product, by stars, by whether it is published,
// and searched across the author, the prose and the product's name.
// Carries the rating summary alongside, because the average describes
// every review and not the twenty-five on this page.
router.get("/getReviews", validateReviewQuery, ReviewController.getReviews);

// The scores on their own, for a screen with no list to show — the
// product editor, and the storefront's product page when it lands.
router.get("/getRatingSummary", ReviewController.getRatingSummary);

router.get(
  "/getReviewById/:id",
  validateReviewIdParam,
  ReviewController.getReviewById,
);

router.post("/createReview", validateCreateReview, ReviewController.createReview);

// A partial update: every field is optional. An empty string clears the
// title or the body — see ReviewService for why that is not the same
// thing as omitting it.
router.put(
  "/updateReview/:id",
  validateReviewIdParam,
  validateUpdateReview,
  ReviewController.updateReview,
);

// The toggle in the row, separate from the editor above it. Taking a
// review off the storefront is a gesture, not a form, and routing it
// through the editor would mean sending a whole review to change one
// boolean.
router.patch(
  "/setPublished/:id",
  validateReviewIdParam,
  validateSetPublished,
  ReviewController.setPublished,
);

// A hard delete, unlike customers and products — see the repository.
// Hiding without destroying is what setPublished is for, and it is the
// default gesture on the screen.
router.delete(
  "/deleteReview/:id",
  validateReviewIdParam,
  ReviewController.deleteReview,
);

export default router;
