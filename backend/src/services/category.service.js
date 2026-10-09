import { CategoryRepository } from "../repository/category.repository.js";
import { CategoryMapper } from "../mapper/category.mapper.js";
import { CreateCategoryDTO, UpdateCategoryDTO } from "../dto/category.dto.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { ImageStorage } from "../config/r2.storage.js";

export class CategoryService {
  static async create(data) {
    let uploadedImage = null;

    try {
      logger.info("Category create requested", {
        name: data.name,
        slug: data.slug,
        hasFits: !!data.fits,
        hasImage: !!data.imageFile,
      });

      const categoryDTO = new CreateCategoryDTO({
        name: data.name,
        slug: data.slug,
        description: data.description,
        fits: data.fits,
        active: data.active,
      });

      if (!categoryDTO.name || !categoryDTO.slug) {
        throw new ApiError(400, "Name and slug are required");
      }

      try {
        const existingSlug = await CategoryRepository.checkSlugExists(
          categoryDTO.slug,
        );
        if (existingSlug) {
          throw new ApiError(409, "Category with this slug already exists", {
            field: "slug",
          });
        }
      } catch (dbError) {
        if (dbError instanceof ApiError) throw dbError;
        logger.error("Database error checking slug", {
          slug: categoryDTO.slug,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to validate category slug");
      }

      if (data.imageFile?.buffer) {
        logger.info("Uploading category image", { slug: categoryDTO.slug });
        try {
          uploadedImage = await ImageStorage.uploadImage(
            data.imageFile.buffer,
            {
              folder: "categories",
            },
          );

          if (!uploadedImage?.imageUrl || !uploadedImage?.imagePublicId) {
            throw new ApiError(500, "Failed to upload category image");
          }

          categoryDTO.image = uploadedImage.imageUrl;
          categoryDTO.imagePublicId = uploadedImage.imagePublicId;
        } catch (uploadError) {
          if (uploadError instanceof ApiError) throw uploadError;
          logger.error("Image upload error", { error: uploadError.message });
          throw new ApiError(500, "Failed to upload category image");
        }
      }

      try {
        const category = await CategoryRepository.create({
          name: categoryDTO.name,
          slug: categoryDTO.slug,
          description: categoryDTO.description,
          fits: categoryDTO.fits,
          image: categoryDTO.image,
          imagePublicId: categoryDTO.imagePublicId,
          active: categoryDTO.active,
        });

        if (!category) {
          throw new ApiError(500, "Failed to create category");
        }

        logger.info("Category created successfully", {
          categoryId: category.id,
          slug: category.slug,
        });

        return CategoryMapper.toDTO(category);
      } catch (createError) {
        if (createError instanceof ApiError) throw createError;

        if (createError.code === "23505") {
          throw new ApiError(409, "Category with this slug already exists", {
            field: "slug",
          });
        }

        logger.error("Database create error", {
          error: createError.message,
          code: createError.code,
        });
        throw new ApiError(500, "Failed to create category");
      }
    } catch (error) {
      if (uploadedImage?.imagePublicId) {
        try {
          logger.info("Cleaning up uploaded image after create failure", {
            imagePublicId: uploadedImage.imagePublicId,
          });
          await ImageStorage.deleteImage(uploadedImage.imagePublicId);
        } catch (cleanupError) {
          logger.error("Failed to cleanup image", {
            error: cleanupError.message,
          });
        }
      }

      if (error instanceof ApiError) throw error;

      logger.error("Category create failed", {
        error: error.message,
        code: error.code,
      });

      throw new ApiError(500, "Failed to create category");
    }
  }

  static async getById(id) {
    try {
      if (!id) throw new ApiError(400, "Category ID is required");

      logger.info("Fetching category by ID", { categoryId: id });

      try {
        const category = await CategoryRepository.findById(id);

        if (!category) {
          throw new ApiError(404, "Category not found");
        }

        logger.info("Category fetched successfully", { categoryId: id });
        return CategoryMapper.toDTO(category);
      } catch (dbError) {
        if (dbError instanceof ApiError) throw dbError;
        logger.error("Database fetch error", {
          categoryId: id,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to fetch category");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Category getById failed", {
        categoryId: id,
        error: error.message,
      });
      throw new ApiError(500, "Failed to fetch category");
    }
  }

  static async getAll(limit = 20, offset = 0) {
    try {
      const safeLimit = Math.min(Math.max(1, limit), 100);
      const safeOffset = Math.max(0, offset);

      logger.info("Fetching all categories", {
        limit: safeLimit,
        offset: safeOffset,
      });

      try {
        const categories = await CategoryRepository.findAll(
          safeLimit,
          safeOffset,
        );
        const total = await CategoryRepository.countAll();

        const result = {
          data: CategoryMapper.toDTOList(categories),
          pagination: {
            total,
            limit: safeLimit,
            offset: safeOffset,
            pages: Math.ceil(total / safeLimit),
          },
        };

        logger.info("Categories fetched successfully", {
          count: categories.length,
          total,
        });

        return result;
      } catch (dbError) {
        logger.error("Database fetch all error", { error: dbError.message });
        throw new ApiError(500, "Failed to fetch categories");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error("Category getAll failed", {
        limit,
        offset,
        error: error.message,
      });
      throw new ApiError(500, "Failed to fetch categories");
    }
  }

  static async update(id, updateData) {
    let uploadedImage = null;

    try {
      if (!id) throw new ApiError(400, "Category ID is required");

      logger.info("Category update requested", {
        categoryId: id,
        fields: Object.keys(updateData),
        hasFits: !!updateData.fits,
        hasImage: !!updateData.imageFile,
      });

      try {
        const category = await CategoryRepository.findById(id);

        if (!category) {
          throw new ApiError(404, "Category not found");
        }

        const categoryDTO = new UpdateCategoryDTO(updateData);

        if (categoryDTO.slug && categoryDTO.slug !== category.slug) {
          try {
            const slugExists = await CategoryRepository.checkSlugExists(
              categoryDTO.slug,
              id,
            );
            if (slugExists) {
              throw new ApiError(
                409,
                "Category with this slug already exists",
                { field: "slug" },
              );
            }
          } catch (slugError) {
            if (slugError instanceof ApiError) throw slugError;
            logger.error("Database slug check error", {
              error: slugError.message,
            });
            throw new ApiError(500, "Failed to validate category slug");
          }
        }

        if (updateData.imageFile?.buffer) {
          logger.info("Uploading new category image", { categoryId: id });
          try {
            uploadedImage = await ImageStorage.uploadImage(
              updateData.imageFile.buffer,
              {
                folder: "categories",
              },
            );

            if (!uploadedImage?.imageUrl || !uploadedImage?.imagePublicId) {
              throw new ApiError(500, "Failed to upload category image");
            }

            categoryDTO.image = uploadedImage.imageUrl;
            categoryDTO.imagePublicId = uploadedImage.imagePublicId;
          } catch (uploadError) {
            if (uploadError instanceof ApiError) throw uploadError;
            logger.error("Image upload error", { error: uploadError.message });
            throw new ApiError(500, "Failed to upload category image");
          }
        }

        const repositoryData = {
          name: categoryDTO.name,
          slug: categoryDTO.slug,
          description: categoryDTO.description,
          fits: categoryDTO.fits,
          image: categoryDTO.image,
          imagePublicId: categoryDTO.imagePublicId,
          active: categoryDTO.active,
        };

        Object.keys(repositoryData).forEach((key) => {
          if (repositoryData[key] === undefined) {
            delete repositoryData[key];
          }
        });

        try {
          const updatedCategory = await CategoryRepository.update(
            id,
            repositoryData,
          );

          if (!updatedCategory) {
            throw new ApiError(404, "Category not found");
          }

          logger.info("Category updated successfully", {
            categoryId: id,
            fields: Object.keys(repositoryData),
          });

          return CategoryMapper.toDTO(updatedCategory);
        } catch (updateError) {
          if (updateError instanceof ApiError) throw updateError;

          if (updateError.code === "23505") {
            throw new ApiError(409, "Category with this slug already exists", {
              field: "slug",
            });
          }

          logger.error("Database update error", {
            categoryId: id,
            error: updateError.message,
          });
          throw new ApiError(500, "Failed to update category");
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw error;
      }
    } catch (error) {
      if (uploadedImage?.imagePublicId) {
        try {
          logger.info("Cleaning up uploaded image after update failure");
          await ImageStorage.deleteImage(uploadedImage.imagePublicId);
        } catch (cleanupError) {
          logger.error("Failed to cleanup image", {
            error: cleanupError.message,
          });
        }
      }

      if (error instanceof ApiError) throw error;

      logger.error("Category update failed", {
        categoryId: id,
        error: error.message,
        code: error.code,
      });

      throw new ApiError(500, "Failed to update category");
    }
  }

  static async delete(id) {
    try {
      if (!id) throw new ApiError(400, "Category ID is required");

      logger.info("Category delete requested", { categoryId: id });

      try {
        const category = await CategoryRepository.findById(id);

        if (!category) {
          throw new ApiError(404, "Category not found");
        }

        await CategoryRepository.softDelete(id);

        if (category.image_public_id) {
          try {
            logger.info("Deleting category image from R2", {
              imagePublicId: category.image_public_id,
            });
            await ImageStorage.deleteImage(category.image_public_id);
          } catch (storageError) {
            logger.error("R2 image delete failed", {
              imagePublicId: category.image_public_id,
              error: storageError.message,
            });
          }
        }

        logger.info("Category deleted successfully", { categoryId: id });
        return { success: true };
      } catch (dbError) {
        if (dbError instanceof ApiError) throw dbError;
        logger.error("Database delete error", {
          categoryId: id,
          error: dbError.message,
        });
        throw new ApiError(500, "Failed to delete category");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Category delete failed", {
        categoryId: id,
        error: error.message,
      });

      throw new ApiError(500, "Failed to delete category");
    }
  }
}
