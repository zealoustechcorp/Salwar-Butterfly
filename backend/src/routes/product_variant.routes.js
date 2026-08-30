// src/routes/product_variant.routes.js

import express from "express";
import { ProductVariantController } from "../controllers/product_variant.controller.js";
import {
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

router.delete("/deleteVariant/:id", ProductVariantController.delete);

export default router;
