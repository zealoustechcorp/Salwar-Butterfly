import { SubCategoryRepository } from "../repository/sub_categories.repository.js";
import { SubCategoryMapper } from "../mapper/sub_categories.mapper.js";
import {
  CreateSubCategoryDTO,
  UpdateSubCategoryDTO,
} from "../dto/sub_categories.dto.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SubCategoryService {
  static async create(data) {
    try {
      logger.info("Sub-category create requested", {
        name: data.name,
        categoryId: data.categoryId,
      });

      const subCategoryDTO = new CreateSubCategoryDTO({
        name: data.name,
        categoryId: data.categoryId,
        isActive: data.isActive,
      });

      if (!subCategoryDTO.name || !subCategoryDTO.categoryId) {
        throw new ApiError(400, "Name and categoryId are required");
      }

      const categoryIdStr = String(subCategoryDTO.categoryId).trim();

      if (!UUID_REGEX.test(categoryIdStr)) {
        throw new ApiError(400, "Invalid category ID format");
      }

      try {
        const categoryExists =
          await SubCategoryRepository.checkCategoryExists(categoryIdStr);
        if (!categoryExists) {
          throw new ApiError(404, "Category not found", {
            field: "categoryId",
          });
        }
      } catch (checkError) {
        if (checkError instanceof ApiError) throw checkError;
        logger.error("Database error checking category", {
          categoryId: categoryIdStr,
          error: checkError.message,
        });
        throw new ApiError(500, "Failed to validate category");
      }

      try {
        const subCategory = await SubCategoryRepository.create({
          name: subCategoryDTO.name,
          categoryId: categoryIdStr,
          isActive: subCategoryDTO.isActive,
        });

        if (!subCategory) {
          throw new ApiError(500, "Failed to create sub-category");
        }

        logger.info("Sub-category created successfully", {
          subCategoryId: subCategory.id,
          categoryId: subCategory.category_id,
        });

        return SubCategoryMapper.toDTO(subCategory);
      } catch (createError) {
        if (createError instanceof ApiError) throw createError;

        if (createError.code === "23503") {
          throw new ApiError(404, "Category not found");
        }

        logger.error("Database create error", {
          error: createError.message,
          code: createError.code,
        });
        throw new ApiError(500, "Failed to create sub-category");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Sub-category create failed", {
        error: error.message,
        code: error.code,
      });

      throw new ApiError(500, "Failed to create sub-category");
    }
  }

  static async getById(id) {
    try {
      if (!id) throw new ApiError(400, "Sub-category ID is required");

      const idStr = String(id).trim();

      if (!UUID_REGEX.test(idStr)) {
        throw new ApiError(400, "Invalid sub-category ID format");
      }

      logger.info("Fetching sub-category by ID", { subCategoryId: idStr });

      try {
        const subCategory = await SubCategoryRepository.findById(idStr);

        if (!subCategory) {
          throw new ApiError(404, "Sub-category not found");
        }

        logger.info("Sub-category fetched successfully", {
          subCategoryId: idStr,
        });
        return SubCategoryMapper.toDTO(subCategory);
      } catch (dbError) {
        if (dbError instanceof ApiError) throw dbError;
        logger.error("Database fetch error", {
          subCategoryId: idStr,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to fetch sub-category");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Sub-category getById failed", {
        subCategoryId: id,
        error: error.message,
      });
      throw new ApiError(500, "Failed to fetch sub-category");
    }
  }

  static async getByCategoryId(categoryId, limit = 20, offset = 0) {
    try {
      if (!categoryId) throw new ApiError(400, "Category ID is required");

      const categoryIdStr = String(categoryId).trim();

      if (!UUID_REGEX.test(categoryIdStr)) {
        throw new ApiError(400, "Invalid category ID format");
      }

      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      logger.info("Fetching sub-categories by category ID", {
        categoryId: categoryIdStr,
        limit: safeLimit,
        offset: safeOffset,
      });

      try {
        const subCategories = await SubCategoryRepository.findByCategoryId(
          categoryIdStr,
          safeLimit,
          safeOffset,
        );
        const total =
          await SubCategoryRepository.countByCategoryId(categoryIdStr);

        const result = {
          data: SubCategoryMapper.toDTOList(subCategories),
          pagination: {
            total,
            limit: safeLimit,
            offset: safeOffset,
            pages: Math.ceil(total / safeLimit),
          },
        };

        logger.info("Sub-categories fetched successfully", {
          categoryId: categoryIdStr,
          count: subCategories.length,
          total,
        });

        return result;
      } catch (dbError) {
        logger.error("Database fetch error", {
          categoryId: categoryIdStr,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to fetch sub-categories");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Sub-category getByCategoryId failed", {
        categoryId,
        error: error.message,
      });
      throw new ApiError(500, "Failed to fetch sub-categories");
    }
  }

  static async getAll(limit = 20, offset = 0) {
    try {
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      logger.info("Fetching all sub-categories", {
        limit: safeLimit,
        offset: safeOffset,
      });

      try {
        const subCategories = await SubCategoryRepository.findAll(
          safeLimit,
          safeOffset,
        );
        const total = await SubCategoryRepository.countAll();

        const result = {
          data: SubCategoryMapper.toDTOList(subCategories),
          pagination: {
            total,
            limit: safeLimit,
            offset: safeOffset,
            pages: Math.ceil(total / safeLimit),
          },
        };

        logger.info("Sub-categories fetched successfully", {
          count: subCategories.length,
          total,
        });

        return result;
      } catch (dbError) {
        logger.error("Database fetch all error", { error: dbError.message });
        throw new ApiError(500, "Failed to fetch sub-categories");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Sub-category getAll failed", {
        limit,
        offset,
        error: error.message,
      });
      throw new ApiError(500, "Failed to fetch sub-categories");
    }
  }

  static async update(id, updateData) {
    try {
      if (!id) throw new ApiError(400, "Sub-category ID is required");

      const idStr = String(id).trim();

      if (!UUID_REGEX.test(idStr)) {
        throw new ApiError(400, "Invalid sub-category ID format");
      }

      logger.info("Sub-category update requested", {
        subCategoryId: idStr,
        fields: Object.keys(updateData),
      });

      try {
        const subCategory = await SubCategoryRepository.findById(idStr);

        if (!subCategory) {
          throw new ApiError(404, "Sub-category not found");
        }

        const subCategoryDTO = new UpdateSubCategoryDTO(updateData);

        if (
          subCategoryDTO.categoryId &&
          subCategoryDTO.categoryId !== subCategory.category_id
        ) {
          const categoryIdStr = String(subCategoryDTO.categoryId).trim();

          if (!UUID_REGEX.test(categoryIdStr)) {
            throw new ApiError(400, "Invalid category ID format");
          }

          try {
            const categoryExists =
              await SubCategoryRepository.checkCategoryExists(categoryIdStr);
            if (!categoryExists) {
              throw new ApiError(404, "Category not found", {
                field: "categoryId",
              });
            }
          } catch (checkError) {
            if (checkError instanceof ApiError) throw checkError;
            throw new ApiError(500, "Failed to validate category");
          }
        }

        const repositoryData = {};

        if (subCategoryDTO.name !== undefined) {
          repositoryData.name = subCategoryDTO.name;
        }

        if (subCategoryDTO.categoryId !== undefined) {
          repositoryData.categoryId = String(subCategoryDTO.categoryId).trim();
        }

        if (subCategoryDTO.isActive !== undefined) {
          repositoryData.isActive = subCategoryDTO.isActive;
        }

        try {
          const updatedSubCategory = await SubCategoryRepository.update(
            idStr,
            repositoryData,
          );

          if (!updatedSubCategory) {
            throw new ApiError(404, "Sub-category not found");
          }

          logger.info("Sub-category updated successfully", {
            subCategoryId: idStr,
            fields: Object.keys(repositoryData),
          });

          return SubCategoryMapper.toDTO(updatedSubCategory);
        } catch (updateError) {
          if (updateError instanceof ApiError) throw updateError;

          if (updateError.code === "23503") {
            throw new ApiError(404, "Category not found");
          }

          logger.error("Database update error", {
            subCategoryId: idStr,
            error: updateError.message,
          });
          throw new ApiError(500, "Failed to update sub-category");
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw error;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Sub-category update failed", {
        subCategoryId: id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to update sub-category");
    }
  }

  static async delete(id) {
    try {
      if (!id) throw new ApiError(400, "Sub-category ID is required");

      const idStr = String(id).trim();

      if (!UUID_REGEX.test(idStr)) {
        throw new ApiError(400, "Invalid sub-category ID format");
      }

      logger.info("Sub-category delete requested", { subCategoryId: idStr });

      try {
        const subCategory = await SubCategoryRepository.findById(idStr);

        if (!subCategory) {
          throw new ApiError(404, "Sub-category not found");
        }

        await SubCategoryRepository.delete(idStr);

        logger.info("Sub-category deleted successfully", {
          subCategoryId: idStr,
        });
        return { success: true };
      } catch (dbError) {
        if (dbError instanceof ApiError) throw dbError;
        logger.error("Database delete error", {
          subCategoryId: idStr,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to delete sub-category");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Sub-category delete failed", {
        subCategoryId: id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to delete sub-category");
    }
  }
}
