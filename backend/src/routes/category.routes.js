import express from "express";
import { CategoryController } from "../controllers/category.controller.js";
import {
  validateCreateCategory,
  validateUpdateCategory,
} from "../validators/category.validator.js";
import {
  handleUploadError,
  uploadCategoryImage,
  validateUploadedImage,
} from "../middlewares/upload.middleware.js";

const router = express.Router();

// handleUploadError sits directly after multer so an oversized or
// duplicated file comes back as a readable 400 rather than falling
// through to the generic handler as a raw MulterError.
router.post(
  "/createCategory",
  uploadCategoryImage,
  handleUploadError,
  validateUploadedImage,
  validateCreateCategory,
  CategoryController.create,
);

router.get("/getAllCategories", CategoryController.getAll);

router.get("/getCategoryById/:id", CategoryController.getById);

router.put(
  "/updateCategory/:id",
  uploadCategoryImage,
  handleUploadError,
  validateUploadedImage,
  validateUpdateCategory,
  CategoryController.update,
);

router.delete("/deleteCategory/:id", CategoryController.delete);

export default router;
