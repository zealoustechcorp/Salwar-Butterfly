import express from "express";
import { CategoryController } from "../controllers/category.controller.js";
import {
  validateCreateCategory,
  validateUpdateCategory,
} from "../validators/category.validator.js";
import {
  uploadCategoryImage,
  validateUploadedImage,
} from "../middlewares/upload.middleware.js";

const router = express.Router();

router.post(
  "/createCategory",
  uploadCategoryImage,
  validateUploadedImage,
  validateCreateCategory,
  CategoryController.create,
);

router.get("/getAllCategories", CategoryController.getAll);

router.get("/getCategoryById/:id", CategoryController.getById);

router.put(
  "/updateCategory/:id",
  uploadCategoryImage,
  validateUploadedImage,
  validateUpdateCategory,
  CategoryController.update,
);

router.delete("/deleteCategory/:id", CategoryController.delete);

export default router;
