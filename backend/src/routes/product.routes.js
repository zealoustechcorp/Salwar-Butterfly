// src/routes/product.routes.js - UPDATED

import express from "express";
import { ProductController } from "../controllers/product.controller.js";
import {
  validateBulkCreateProducts,
  validateCreateProduct,
  validateUpdateProduct,
} from "../validators/product.validator.js";

const router = express.Router();

router.post("/createProduct", validateCreateProduct, ProductController.create);

// Not validateCreateProduct, which reads a single product off the body
// root: the bulk payload is { categoryId, products: [...] }. Its own
// validator holds every row to the same rules (collectCreateProductErrors)
// and reports them all at once, keyed products[i].field.
router.post(
  "/bulkCreateProducts",
  validateBulkCreateProducts,
  ProductController.bulkCreate,
);

router.post("/bulkUpdateCategory", ProductController.bulkUpdateCategory);

router.get("/getAllProducts", ProductController.getAll);

router.get("/getProductById/:id", ProductController.getById);

router.get("/getProductBySlug/:slug", ProductController.getBySlug);

router.put(
  "/updateProduct/:id",
  validateUpdateProduct,
  ProductController.update,
);

router.patch("/updateProductStatus/:id", ProductController.updateStatus);

router.delete("/deleteProduct/:id", ProductController.delete);

export default router;
