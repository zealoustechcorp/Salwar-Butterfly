// src/services/product_attribute_value.service.js

import { AttributeValueRepository } from "../repository/product_attribute_value.repository.js";
import {
  CreateAttributeValueDTO,
  UpdateAttributeValueDTO,
} from "../dto/product_attribute_value.dto.js";
import { AttributeValueMapper } from "../mapper/product_attribute_value.mapper.js";
import { COLOUR_GROUP, isRegisterGroup } from "../config/attribute.groups.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GROUP_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

const assertUuid = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized || !UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return normalized;
};

/**
 * Group names are keys inside `products.attributes`, so they are held to
 * the same shape a JSON key should have: lowercase, no spaces. That is
 * what keeps "Fabric" and "fabric" from becoming two groups.
 */
const normalizeGroupName = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Attribute group is required");
  }

  const group = value.trim().toLowerCase();

  if (group.length > 40) {
    throw new ApiError(400, "Attribute group must not exceed 40 characters");
  }

  if (!GROUP_NAME_REGEX.test(group)) {
    throw new ApiError(
      400,
      "Attribute group may contain only lowercase letters, numbers and underscores",
    );
  }

  return group;
};

const normalizeValue = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Value is required");
  }

  const trimmed = value.trim();

  if (trimmed.length > 100) {
    throw new ApiError(400, "Value must not exceed 100 characters");
  }

  return trimmed;
};

const HEX_REGEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A swatch, stored as '#RRGGBB' and nothing else.
 *
 * Shorthand and a missing hash are accepted and expanded here rather
 * than refused, because both are what a person types; what is stored is
 * the one canonical form, so no reader ever has to normalise before it
 * can render. Upper-cased for the same reason — two rows differing only
 * in the case of their hex are the same colour and should not read as
 * two.
 *
 * An empty string clears the swatch. That is a real edit, not a
 * malformed one: a colour with no tone recorded renders as a name chip.
 */
const normalizeHex = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  if (typeof value !== "string" || !HEX_REGEX.test(value.trim())) {
    throw new ApiError(400, "Colour must be a hex code such as #7B1E3A");
  }

  const digits = value.trim().replace("#", "");

  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  return `#${full.toUpperCase()}`;
};

const normalizeBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

export const AttributeValueService = {
  /**
   * The whole register, grouped by attribute.
   *
   * `activeOnly` is what the product form asks for — a retired value
   * must not be offered on a new product, but must still be listed on
   * the attributes screen so it can be brought back.
   */
  async getAll({ activeOnly = false } = {}) {
    try {
      const rows = await AttributeValueRepository.findAll({ activeOnly });

      logger.info("Attribute values fetched", {
        count: rows.length,
        activeOnly,
      });

      return {
        data: AttributeValueMapper.toDTOList(rows),
        groups: AttributeValueMapper.toGroups(rows),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("AttributeValueService.getAll failed", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch attribute values");
    }
  },

  async getByGroup(groupName, { activeOnly = false } = {}) {
    try {
      const group = normalizeGroupName(groupName);

      const rows = await AttributeValueRepository.findByGroup(group, {
        activeOnly,
      });

      return AttributeValueMapper.toDTOList(rows);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("AttributeValueService.getByGroup failed", {
        groupName,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch attribute values");
    }
  },

  async create({ groupName, value, hex, active, position } = {}) {
    try {
      const group = normalizeGroupName(groupName);

      // The fit is an attribute of a product like any other, but its
      // list is `size_charts`, not this register — a fit exists because
      // the shop published a chart for it. Registering one here would
      // offer the product form a fit with no table behind it, which is
      // a size guide that quietly shows every chart instead of the
      // shopper's. See config/attribute.groups.js.
      if (!isRegisterGroup(group)) {
        throw new ApiError(
          400,
          "Fits are not registered here — add a size chart for the fit instead",
        );
      }

      const dto = new CreateAttributeValueDTO({
        groupName: group,
        value: normalizeValue(value),
        hex: normalizeHex(hex) ?? null,
        active: normalizeBoolean(active, true),
        position:
          position === undefined || position === null || position === ""
            ? null
            : Number(position),
      });

      logger.info("Creating attribute value", {
        groupName: dto.groupName,
        value: dto.value,
      });

      const row = await AttributeValueRepository.create(dto);

      // Re-read so the response carries usage_count like every other
      // read does. Not always zero: registering a value that products
      // already carry as legacy free text should report those products.
      const fresh = await AttributeValueRepository.findById(row.id);

      return AttributeValueMapper.toDTO(fresh ?? row);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "ATTRIBUTE_VALUE_EXISTS") {
        throw new ApiError(409, `"${value}" is already in this group`);
      }

      logger.error("AttributeValueService.create failed", {
        groupName,
        value,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to create attribute value");
    }
  },

  /**
   * Renaming carries the products along; retiring and reordering do not
   * touch them.
   */
  async update(id, updateData = {}) {
    try {
      const valueId = assertUuid(id, "attribute value ID");

      const hasFields =
        updateData.value !== undefined ||
        updateData.hex !== undefined ||
        updateData.active !== undefined ||
        updateData.position !== undefined;

      if (!hasFields) {
        throw new ApiError(400, "At least one field is required to update");
      }

      const existing = await AttributeValueRepository.findById(valueId);
      if (!existing) throw new ApiError(404, "Attribute value not found");

      let productsUpdated = 0;
      let row = existing;

      if (updateData.value !== undefined) {
        const nextValue = normalizeValue(updateData.value);

        if (nextValue !== existing.value) {
          const result = await AttributeValueRepository.renameWithProducts(
            valueId,
            nextValue,
          );

          if (!result.row) throw new ApiError(404, "Attribute value not found");

          row = result.row;
          productsUpdated = result.productsUpdated;
        }
      }

      const patch = new UpdateAttributeValueDTO({
        hex: normalizeHex(updateData.hex),
        active:
          updateData.active === undefined
            ? undefined
            : normalizeBoolean(updateData.active, true),
        position:
          updateData.position === undefined
            ? undefined
            : Number(updateData.position),
      });

      if (Object.keys(patch).length > 0) {
        const updated = await AttributeValueRepository.update(valueId, patch);
        if (!updated) throw new ApiError(404, "Attribute value not found");
        row = updated;
      }

      // Re-read so usage_count reflects the rename.
      const fresh = await AttributeValueRepository.findById(valueId);

      logger.info("Attribute value updated", { id: valueId, productsUpdated });

      return {
        data: AttributeValueMapper.toDTO(fresh ?? row),
        productsUpdated,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error?.code === "ATTRIBUTE_VALUE_EXISTS") {
        throw new ApiError(409, "Another value in this group already uses that name");
      }

      // Only reachable on a colour: renaming it rewrites the variants
      // carrying it, and a product already listing that size in the
      // target colour cannot list it twice.
      if (error?.code === "COLOUR_RENAME_COLLIDES") {
        throw new ApiError(
          409,
          "A product already lists one of those sizes in the new colour — merge the two colourways by hand first",
        );
      }

      if (error?.code === "ATTRIBUTE_HEX_INVALID") {
        throw new ApiError(400, "Colour must be a hex code such as #7B1E3A");
      }

      logger.error("AttributeValueService.update failed", {
        id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update attribute value");
    }
  },

  /**
   * Deleting only removes the value from the register — products already
   * carrying it keep it, since `products.attributes` is free-form JSON
   * with no foreign key here. A value still in use is refused, because
   * removing it would leave products showing something the register can
   * no longer explain; retiring it is the way to take it out of
   * circulation.
   */
  async delete(id) {
    try {
      const valueId = assertUuid(id, "attribute value ID");

      const existing = await AttributeValueRepository.findById(valueId);
      if (!existing) throw new ApiError(404, "Attribute value not found");

      const usage = Number(existing.usage_count ?? 0);

      if (usage > 0) {
        throw new ApiError(
          409,
          `"${existing.value}" is used by ${usage} product${usage === 1 ? "" : "s"} — retire it instead of deleting it`,
        );
      }

      const deleted = await AttributeValueRepository.delete(valueId);
      if (!deleted) throw new ApiError(404, "Attribute value not found");

      logger.info("Attribute value deleted", { id: valueId });
      return { id: deleted.id };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("AttributeValueService.delete failed", {
        id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete attribute value");
    }
  },
};
