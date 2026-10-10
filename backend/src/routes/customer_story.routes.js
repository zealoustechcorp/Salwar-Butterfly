// src/routes/customer_story.routes.js
//
// What customers have sent the shop (F-06.08), admin side.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// Every endpoint here changes the home page, and one of them publishes a
// photograph somebody sent the shop privately — there is no public
// subset of this, and there is certainly no shopper write path. What the
// shop chooses to print is the shop's decision, made on this screen.
//
// The shopper's read is `GET /storefront/getCustomerStories`, in the
// GET-only router whose columns are named one at a time. That is where a
// story loses its id, its position, its published flag and its
// R2 object key.

import express from "express";

import { CustomerStoryController } from "../controllers/customer_story.controller.js";
import {
  handleStoryUploadError,
  handleUploadError,
  uploadStoryImage,
  uploadStoryImages,
  validateUploadedImage,
  validateUploadedImages,
} from "../middlewares/upload.middleware.js";
import {
  validateReorder,
  validateSetPublished,
  validateStoryIdParam,
  validateStoryImage,
  validateStoryUpload,
  validateUpdateStory,
} from "../validators/customer_story.validator.js";

const router = express.Router();

router.get(
  "/getCustomerStories",
  CustomerStoryController.getCustomerStories,
);

router.get(
  "/getCustomerStoryById/:id",
  validateStoryIdParam,
  CustomerStoryController.getCustomerStoryById,
);

// The only way in: a batch of photographs, one story each, nothing
// typed. A story must carry a picture (019), so there is no JSON create
// beside this one — everything a story can be starts with a file.
//
// The multipart chain reads left to right — multer parses, its error
// handler turns a count or size refusal into a sentence, the magic-byte
// check verifies every buffer, and only then does the validator ask
// whether there was a file at all.
router.post(
  "/createCustomerStories",
  uploadStoryImages,
  handleStoryUploadError,
  validateUploadedImages,
  validateStoryUpload,
  CustomerStoryController.createFromImages,
);

// Naming the customer, quoting them, pointing the card at a piece. A
// full replace of those three, any of which may be cleared; the
// photograph is not touched.
router.put(
  "/updateCustomerStory/:id",
  validateStoryIdParam,
  validateUpdateStory,
  CustomerStoryController.updateCustomerStory,
);

// Swapping the photograph on a card that already has one.
router.put(
  "/replaceStoryImage/:id",
  validateStoryIdParam,
  uploadStoryImage,
  handleUploadError,
  validateUploadedImage,
  validateStoryImage,
  CustomerStoryController.replaceStoryImage,
);

// The toggle in the admin row.
router.patch(
  "/setStoryPublished/:id",
  validateStoryIdParam,
  validateSetPublished,
  CustomerStoryController.setPublished,
);

// The order the cards are shown in. Takes the whole set — see the
// service for why a partial list is refused rather than half-applied.
router.patch(
  "/reorderCustomerStories",
  validateReorder,
  CustomerStoryController.reorder,
);

// Destroys the photograph along with the row, and a customer's
// photograph is not something the shop can ask for twice.
// `setStoryPublished` is the reversible gesture, and it is the one the
// admin screen offers first.
router.delete(
  "/deleteCustomerStory/:id",
  validateStoryIdParam,
  CustomerStoryController.deleteCustomerStory,
);

export default router;
