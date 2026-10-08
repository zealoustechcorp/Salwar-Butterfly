// src/routes/product_image.routes.js

import express from "express";
import { ProductImageController } from "../controllers/product_image.controller.js";
import {
  handleProductUploadError,
  uploadProductImages,
  validateUploadedImages,
} from "../middlewares/upload.middleware.js";
import {
  validateImageIdParam,
  validateProductIdParam,
  validateReorderImages,
  validateUpdateImage,
  validateUploadRequest,
} from "../validators/product_image.validator.js";

const router = express.Router();

// The gallery editor's upload. `handleUploadError` sits directly after
// multer so an oversized or over-count batch comes back as a readable
// 400 instead of falling through to the generic handler.
router.post(
  "/uploadProductImages/:productId",
  uploadProductImages,
  handleProductUploadError,
  validateUploadedImages,
  validateUploadRequest,
  ProductImageController.upload,
);

// Every image in the catalogue, grouped by product in `meta.galleries` —
// what the product list needs to show a thumbnail per row.
router.get("/getAllProductImages", ProductImageController.getAll);

router.get(
  "/getImagesByProduct/:productId",
  validateProductIdParam,
  ProductImageController.getByProduct,
);

// The whole order in one write, the same way the size set is replaced:
// the gallery is dragged as a unit, so it saves as one.
router.put(
  "/reorderProductImages/:productId",
  validateReorderImages,
  ProductImageController.reorder,
);

router.patch(
  "/updateProductImage/:id",
  validateUpdateImage,
  ProductImageController.update,
);

router.delete(
  "/deleteProductImage/:id",
  validateImageIdParam,
  ProductImageController.delete,
);

export default router;
