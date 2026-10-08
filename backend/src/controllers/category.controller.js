import { CategoryService } from "../services/category.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export const CategoryController = {
  create: asyncHandler(async (req, res) => {
    try {
      const { name, slug, description, fits, active } = req.body;

      logger.info("Create category request", {
        name,
        slug,
        hasFits: !!fits,
        hasImage: !!req.file,
      });

      const categoryData = {
        name,
        slug,
        description,
        fits,
        active,
        imageFile: req.file || null,
      };

      const category = await CategoryService.create(categoryData);

      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Create category error", { error: error.message });

      throw new ApiError(500, "Failed to create category");
    }
  }),

  getAll: asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 20;

      logger.info("Get all categories request", { page, limit });

      const result = await CategoryService.getAll(limit, page);

      return res.status(200).json({
        success: true,
        message: "Categories fetched successfully",
        data: result.data,
        meta: {
          pagination: result.pagination,
        },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get all categories error", { error: error.message });

      throw new ApiError(500, "Failed to fetch categories");
    }
  }),

  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Get category by ID request", { categoryId: id });

      const category = await CategoryService.getById(id);

      return res.status(200).json({
        success: true,
        message: "Category fetched successfully",
        data: category,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get category by ID error", {
        categoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to fetch category");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { name, slug, description, fits, active } = req.body;

      logger.info("Update category request", {
        categoryId: id,
        hasFits: !!fits,
        hasImage: !!req.file,
      });

      const updateData = {};

      if (name !== undefined) updateData.name = name;
      if (slug !== undefined) updateData.slug = slug;
      if (description !== undefined) updateData.description = description;
      if (fits !== undefined) updateData.fits = fits;
      if (active !== undefined) updateData.active = active;
      if (req.file) updateData.imageFile = req.file;

      if (Object.keys(updateData).length === 0) {
        throw new ApiError(400, "At least one field is required to update");
      }

      const category = await CategoryService.update(id, updateData);

      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: category,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update category error", {
        categoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to update category");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete category request", { categoryId: id });

      await CategoryService.delete(id);

      return res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete category error", {
        categoryId: req.params.id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to delete category");
    }
  }),
};
