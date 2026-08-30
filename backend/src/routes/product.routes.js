// src/routes/product.routes.js - UPDATED

import express from "express";
import { ProductController } from "../controllers/product.controller.js";
import {
  validateCreateProduct,
  validateUpdateProduct,
} from "../validators/product.validator.js";

const router = express.Router();

router.post("/createProduct", validateCreateProduct, ProductController.create);

// No validateCreateProduct here: that middleware reads a single product
// off the body root and would reject every bulk payload, whose shape is
// { categoryId, products: [...] }. ProductService.bulkCreateByCategoryId
// validates each element and reports the offending index.
router.post("/bulkCreateProducts", ProductController.bulkCreate);

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
