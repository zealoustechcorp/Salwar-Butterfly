import { SubCategoryService } from "../services/sub_categories.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export const SubCategoryController = {
  create: asyncHandler(async (req, res) => {
    try {
      const { name, categoryId, isActive } = req.body;

      logger.info("Create sub-category request", { name, categoryId });

      const subCategoryData = {
        name,
        categoryId,
        isActive,
      };

      const subCategory = await SubCategoryService.create(subCategoryData);

      return res.status(201).json({
        success: true,
        message: "Sub-category created successfully",
        data: subCategory,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Create sub-category error", { error: error.message });
      throw new ApiError(500, "Failed to create sub-category");
    }
  }),

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Get sub-category by ID request", { subCategoryId: id });

      const subCategory = await SubCategoryService.getById(id);

      return res.status(200).json({
        success: true,
        message: "Sub-category fetched successfully",
        data: subCategory,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get sub-category by ID error", {
        subCategoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to fetch sub-category");
    }
  }),

  getByCategoryId: asyncHandler(async (req, res) => {
    try {
      const { categoryId } = req.params;
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 20;

      logger.info("Get sub-categories by category ID request", {
        categoryId,
        page,
        limit,
      });

      const result = await SubCategoryService.getByCategoryId(
        categoryId,
        limit,
        page,
      );

      return res.status(200).json({
        success: true,
        message: "Sub-categories fetched successfully",
        data: result.data,
        meta: {
          pagination: result.pagination,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get sub-categories by category ID error", {
        categoryId: req.params.categoryId,
        error: error.message,
      });

      throw new ApiError(500, "Failed to fetch sub-categories");
    }
  }),

  getAll: asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 20;

      logger.info("Get all sub-categories request", { page, limit });

      const result = await SubCategoryService.getAll(limit, page);

      return res.status(200).json({
        success: true,
        message: "Sub-categories fetched successfully",
        data: result.data,
        meta: {
          pagination: result.pagination,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get all sub-categories error", { error: error.message });
      throw new ApiError(500, "Failed to fetch sub-categories");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { name, categoryId, isActive } = req.body;

      logger.info("Update sub-category request", { subCategoryId: id });

      const updateData = {};

      if (name !== undefined) updateData.name = name;
      if (categoryId !== undefined) updateData.categoryId = categoryId;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (Object.keys(updateData).length === 0) {
        throw new ApiError(400, "At least one field is required to update");
      }

      const subCategory = await SubCategoryService.update(id, updateData);

      return res.status(200).json({
        success: true,
        message: "Sub-category updated successfully",
        data: subCategory,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update sub-category error", {
        subCategoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to update sub-category");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete sub-category request", { subCategoryId: id });

      await SubCategoryService.delete(id);

      return res.status(200).json({
        success: true,
        message: "Sub-category deleted successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete sub-category error", {
        subCategoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to delete sub-category");
    }
  }),
};
