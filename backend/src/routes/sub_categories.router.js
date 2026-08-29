import express from "express";
import { SubCategoryController } from "../controllers/sub_categories.controller.js";
import {
  validateCreateSubCategory,
  validateUpdateSubCategory,
} from "../validators/sub_categories.validator.js";

const router = express.Router();

router.post(
  "/createSubCategory",
  validateCreateSubCategory,
  SubCategoryController.create,
);

router.get("/getAllSubCategories", SubCategoryController.getAll);

router.get(
  "/getSubCategoriesByCategory/:categoryId",
  SubCategoryController.getByCategoryId,
);

router.get("/getSubCategoryById/:id", SubCategoryController.getById);

router.put(
  "/updateSubCategory/:id",
  validateUpdateSubCategory,
  SubCategoryController.update,
);

router.delete("/deleteSubCategory/:id", SubCategoryController.delete);

export default router;
