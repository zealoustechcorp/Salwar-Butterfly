// src/routes/banner.routes.js
//
// The home page carousel (F-06), admin side.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js
// with the rest of the storefront's writers. Every endpoint here changes
// the first thing a visitor sees, so there is no public subset worth
// carving out.
//
// The shopper's read is `GET /storefront/getBanners`, in the GET-only
// router whose columns are named one at a time. That is where a banner
// loses its id, its position, its active flag and — the one that
// matters — its Cloudinary public id, which is the handle that deletes
// the file. Not here, and not by a filter downstream.

import express from "express";

import { BannerController } from "../controllers/banner.controller.js";
import {
  handleBannerUploadError,
  handleUploadError,
  uploadBannerImage,
  uploadBannerImages,
  validateUploadedImage,
  validateUploadedImages,
} from "../middlewares/upload.middleware.js";
import {
  validateBannerIdParam,
  validateBannerImage,
  validateBannerUpload,
  validateReorder,
  validateSetActive,
} from "../validators/banner.validator.js";

const router = express.Router();

router.get("/getBanners", BannerController.getBanners);

router.get(
  "/getBannerById/:id",
  validateBannerIdParam,
  BannerController.getBannerById,
);

// Adding slides. The multipart chain reads left to right: multer parses
// the files, its error handler turns a count or size refusal into a
// sentence, the magic-byte check verifies every buffer is really an
// image, and only then does the validator ask whether there was a file
// at all. The ceiling on the carousel as a whole is the service's, since
// only it can count the rows already in the table.
router.post(
  "/createBanners",
  uploadBannerImages,
  handleBannerUploadError,
  validateUploadedImages,
  validateBannerUpload,
  BannerController.createBanners,
);

// Swapping one slide's artwork without losing its place in the order.
// Single file, so it takes the single-image middleware and the default
// error handler that names the `image` field.
router.put(
  "/replaceBannerImage/:id",
  validateBannerIdParam,
  uploadBannerImage,
  handleUploadError,
  validateUploadedImage,
  validateBannerImage,
  BannerController.replaceBannerImage,
);

// The toggle in the admin row. Separate from everything above it so that
// taking a banner down does not mean re-uploading its artwork.
router.patch(
  "/setBannerActive/:id",
  validateBannerIdParam,
  validateSetActive,
  BannerController.setActive,
);

// The order the slides rotate in. Takes the whole set — see the service
// for why a partial list is refused rather than half-applied.
router.patch("/reorderBanners", validateReorder, BannerController.reorder);

// Destroys the Cloudinary file along with the row. `setBannerActive` is
// the reversible gesture, and it is the one the admin screen offers
// first.
router.delete(
  "/deleteBanner/:id",
  validateBannerIdParam,
  BannerController.deleteBanner,
);

export default router;
