import { CategoryRepository } from "../repository/category.repository.js";
import { CategoryMapper } from "../mapper/category.mapper.js";
import { CreateCategoryDTO, UpdateCategoryDTO } from "../dto/category.dto.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { ImageStorage } from "../config/r2.storage.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SLUG_TAKEN = "Category with this slug already exists";
const NAME_TAKEN = "Category with this name already exists";

/**
 * Category ids are uuids. Anything else reached Postgres as a cast error
 * (22P02) and came back a 500; it is a malformed request, so it is a 400.
 */
const assertCategoryId = (id) => {
  const normalized = String(id ?? "").trim();

  if (!normalized) throw new ApiError(400, "Category ID is required");

  if (!UUID_REGEX.test(normalized)) {
    throw new ApiError(400, "Invalid category ID format", {
      id: "Category ID must be a UUID",
    });
  }

  return normalized;
};

/**
 * Which column a unique violation on `categories` is about.
 *
 * The migration declares `name` and `slug` UNIQUE; the live database has
 * only a partial unique index on slug (`categories_slug_unique`, WHERE
 * deleted_at IS NULL). Every 23505 used to be reported as a duplicate
 * slug, so a clashing name told the admin to change a slug that was
 * fine. Postgres names the column in `detail` ("Key (name)=(...)") on
 * either schema, and the constraint name is the fallback.
 */
export const categoryUniqueField = (error) => {
  const detail = String(error?.detail ?? "");
  const constraint = String(error?.constraint ?? "");

  if (/^Key \(name\)=/.test(detail) || /_name_/.test(`${constraint}_`)) {
    return "name";
  }

  return "slug";
};

/**
 * The 409 for a unique violation, worded for what actually clashed.
 *
 * A slug clash the pre-check did not see is almost always a deleted
 * category: the check ignores deleted rows, but on a database built from
 * the migration their slug is still taken. Saying "already exists" there
 * sends the admin looking for a category the list does not show.
 */
const uniqueViolation = async (error, slug, excludeId = null) => {
  if (categoryUniqueField(error) === "name") {
    return new ApiError(409, NAME_TAKEN, { name: NAME_TAKEN });
  }

  const holder = slug
    ? await CategoryRepository.findSlugHolder(slug, excludeId).catch(() => null)
    : null;

  if (holder?.deleted_at) {
    const message =
      `The slug "${slug}" still belongs to the deleted category ` +
      `"${holder.name}". Choose another slug.`;

    return new ApiError(409, message, { slug: message });
  }

  return new ApiError(409, SLUG_TAKEN, { slug: SLUG_TAKEN });
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const subCategoryCount = (count) =>
  `${count} sub-categor${count === 1 ? "y" : "ies"}`;

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
          throw new ApiError(409, SLUG_TAKEN, { slug: SLUG_TAKEN });
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
          throw await uniqueViolation(createError, categoryDTO.slug);
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

  static async getById(rawId) {
    const id = assertCategoryId(rawId);

    try {
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
            // 1-based. Its presence is also how a client tells that this
            // API reads `page` as a page number rather than an offset.
            page: Math.floor(safeOffset / safeLimit) + 1,
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

  static async update(rawId, updateData) {
    const id = assertCategoryId(rawId);
    let uploadedImage = null;

    try {
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
              throw new ApiError(409, SLUG_TAKEN, { slug: SLUG_TAKEN });
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

          // The photograph this one replaced. The row no longer points at
          // it, so nothing ever would again — it is removed now, after the
          // write has committed, rather than left in the bucket. Best
          // effort: the update has succeeded, and a failure here is a
          // stray object to sweep up later, not a reason to report the
          // save as failed.
          if (
            uploadedImage?.imagePublicId &&
            category.image_public_id &&
            category.image_public_id !== uploadedImage.imagePublicId
          ) {
            await ImageStorage.deleteImage(category.image_public_id).catch(
              (storageError) => {
                logger.error("Replaced category image could not be deleted", {
                  categoryId: id,
                  imagePublicId: category.image_public_id,
                  error: storageError?.message,
                });
              },
            );
          }

          return CategoryMapper.toDTO(updatedCategory);
        } catch (updateError) {
          if (updateError instanceof ApiError) throw updateError;

          if (updateError.message === "CATEGORY_NOT_FOUND") {
            throw new ApiError(404, "Category not found");
          }

          if (updateError.code === "23505") {
            throw await uniqueViolation(
              updateError,
              repositoryData.slug ?? category.slug,
              id,
            );
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

  /**
   * Soft-deletes a category — but only an empty one.
   *
   * It used to delete regardless. The products stayed attached to a
   * category no admin screen lists, unreachable for editing by category
   * and (until the storefront learned to check) still on sale under a
   * tile that had vanished. Products and sub-categories are counted and
   * the delete is refused with both numbers, so the admin knows what to
   * move first. The repository re-checks emptiness inside the UPDATE, so
   * a product filed in between still stops it.
   */
  static async delete(rawId) {
    const id = assertCategoryId(rawId);

    try {
      logger.info("Category delete requested", { categoryId: id });

      try {
        const category = await CategoryRepository.findById(id);

        if (!category) {
          throw new ApiError(404, "Category not found");
        }

        const refuseIfInUse = async () => {
          const { products, subCategories } =
            await CategoryRepository.countDependents(id);

          if (products === 0 && subCategories === 0) return;

          const parts = [];
          const errors = {};

          if (products > 0) {
            parts.push(plural(products, "product"));
            errors.products = `${plural(products, "product")} still in this category — move or delete them first`;
          }

          if (subCategories > 0) {
            parts.push(subCategoryCount(subCategories));
            errors.subCategories = `${subCategoryCount(subCategories)} still in this category — delete them first`;
          }

          throw new ApiError(
            409,
            `"${category.name}" still has ${parts.join(" and ")}. Move or delete them before deleting the category.`,
            errors,
          );
        };

        await refuseIfInUse();

        try {
          await CategoryRepository.softDelete(id);
        } catch (deleteError) {
          // Zero rows: the category went, or something was filed into it
          // after the count above. Count again to say which.
          if (deleteError?.message === "CATEGORY_NOT_FOUND") {
            await refuseIfInUse();
            throw new ApiError(404, "Category not found");
          }
          throw deleteError;
        }

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
