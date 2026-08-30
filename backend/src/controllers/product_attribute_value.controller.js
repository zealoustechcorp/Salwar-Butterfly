// src/controllers/product_attribute_value.controller.js

import { AttributeValueService } from "../services/product_attribute_value.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import {
  successResponse,
  createdResponse,
  noContentResponse,
  okResponse,
} from "../utils/apiResponse.js";

export const AttributeValueController = {
  getAll: asyncHandler(async (req, res) => {
    try {
      const { activeOnly = "false" } = req.query;

      logger.info("Get attribute values endpoint called", { activeOnly });

      const result = await AttributeValueService.getAll({
        activeOnly: activeOnly === "true" || activeOnly === true,
      });

      return successResponse({
        res,
        data: result.data,
        meta: { groups: result.groups },
        message: "Attribute values retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get attribute values endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch attribute values");
    }
  }),

  getByGroup: asyncHandler(async (req, res) => {
    try {
      const { groupName } = req.params;
      const { activeOnly = "false" } = req.query;

      logger.info("Get attribute values by group endpoint called", {
        groupName,
      });

      const data = await AttributeValueService.getByGroup(groupName, {
        activeOnly: activeOnly === "true" || activeOnly === true,
      });

      return okResponse({
        res,
        data,
        message: "Attribute values retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get attribute values by group endpoint error", {
        groupName: req.params?.groupName,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to fetch attribute values");
    }
  }),

  create: asyncHandler(async (req, res) => {
    try {
      const { groupName, value, active, position } = req.body;

      logger.info("Create attribute value endpoint called", {
        groupName,
        value,
      });

      const data = await AttributeValueService.create({
        groupName,
        value,
        active,
        position,
      });

      return createdResponse({
        res,
        data,
        message: `"${data.value}" added to ${data.groupName}`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Create attribute value endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to create attribute value");
    }
  }),

  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Update attribute value endpoint called", {
        id,
        fields: Object.keys(req.body ?? {}),
      });

      const result = await AttributeValueService.update(id, req.body);

      return okResponse({
        res,
        data: result.data,
        meta: { productsUpdated: result.productsUpdated },
        message: result.productsUpdated
          ? `Renamed, and updated ${result.productsUpdated} product${result.productsUpdated === 1 ? "" : "s"} using it`
          : "Attribute value updated successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update attribute value endpoint error", {
        id: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update attribute value");
    }
  }),

  updateStatus: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;

      logger.info("Update attribute value status endpoint called", {
        id,
        active,
      });

      if (typeof active !== "boolean") {
        throw new ApiError(400, "Active must be a boolean value");
      }

      const result = await AttributeValueService.update(id, { active });

      return okResponse({
        res,
        data: result.data,
        message: active
          ? `"${result.data.value}" is offered again`
          : `"${result.data.value}" is retired from new products`,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Update attribute value status endpoint error", {
        id: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to update attribute value status");
    }
  }),

  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info("Delete attribute value endpoint called", { id });

      await AttributeValueService.delete(id);

      return noContentResponse(res);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Delete attribute value endpoint error", {
        id: req.params?.id,
        error: error?.message,
      });

      throw new ApiError(500, "Failed to delete attribute value");
    }
  }),
};
