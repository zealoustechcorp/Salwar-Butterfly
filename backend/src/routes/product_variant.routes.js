// src/routes/product_variant.routes.js

import express from "express";
import { ProductVariantController } from "../controllers/product_variant.controller.js";
import {
  validateBulkVariantDelete,
  validateBulkVariantStatus,
  validateCreateVariant,
  validateReplaceVariants,
  validateUpdateVariant,
} from "../validators/product_variant.validator.js";

const router = express.Router();

router.post("/createVariant", validateCreateVariant, ProductVariantController.create);

// What the product form saves: the whole size set for one product, in
// one transaction. Sizes not in the payload are removed.
router.put(
  "/replaceProductVariants/:productId",
  validateReplaceVariants,
  ProductVariantController.replaceForProduct,
);

router.get("/getAllVariants", ProductVariantController.getAll);

router.get(
  "/getVariantsByProduct/:productId",
  ProductVariantController.getByProduct,
);

router.get("/getVariantById/:id", ProductVariantController.getById);

router.put("/updateVariant/:id", validateUpdateVariant, ProductVariantController.update);

router.patch("/updateVariantStock/:id", ProductVariantController.updateStock);

// Multi-select (F-03.11). Deactivating is the reversible half — the
// size keeps its stock and its history and simply stops being offered.
router.patch(
  "/bulkSetVariantActive",
  validateBulkVariantStatus,
  ProductVariantController.bulkSetActive,
);

// The irreversible half. A size still holding stock is reported back
// rather than removed, unless `force` says otherwise — deleting a
// variant destroys the only record of that stock.
router.delete(
  "/bulkDeleteVariants",
  validateBulkVariantDelete,
  ProductVariantController.bulkDelete,
);

router.delete("/deleteVariant/:id", ProductVariantController.delete);

export default router;
