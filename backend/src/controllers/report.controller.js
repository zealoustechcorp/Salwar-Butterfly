// src/controllers/report.controller.js

import { ReportService } from "../services/report.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { okResponse } from "../utils/apiResponse.js";

export const ReportController = {
  getDashboard: asyncHandler(async (req, res) => {
    try {
      logger.info("Get dashboard endpoint called");

      const dashboard = await ReportService.getDashboard();

      return okResponse({
        res,
        data: dashboard,
        message: "Dashboard retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get dashboard endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to build the dashboard");
    }
  }),

  getSalesReport: asyncHandler(async (req, res) => {
    try {
      const { period, from, to, topSort, topLimit } = req.query;

      logger.info("Get sales report endpoint called", { period, from, to });

      const report = await ReportService.getSalesReport({
        period,
        from,
        to,
        topSort,
        topLimit,
      });

      return okResponse({
        res,
        data: {
          series: report.series,
          topProducts: report.topProducts,
        },

        // The totals and the range describe the series rather than
        // being part of it, so they travel as meta — the same split the
        // paginated lists use, where `data` is the rows and `meta` is
        // what is true about them.
        meta: {
          period: report.period,
          topSort: report.topSort,
          timezone: report.timezone,
          range: report.range,
          totals: report.totals,
        },

        message: "Sales report retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get sales report endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to build the sales report");
    }
  }),

  getOrderReport: asyncHandler(async (req, res) => {
    try {
      const {
        from,
        to,
        status,
        paymentStatus,
        search,
        sort,
        page = 1,
        limit = 25,
      } = req.query;

      logger.info("Get order report endpoint called", { from, to, status });

      const report = await ReportService.getOrderReport({
        from,
        to,
        status,
        paymentStatus,
        search,
        sort,
        page,
        limit,
      });

      return okResponse({
        res,
        data: report.data,
        meta: {
          pagination: report.pagination,
          totals: report.totals,
          timezone: report.timezone,
          range: report.range,
        },
        message: "Order report retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get order report endpoint error", { error: error?.message });
      throw new ApiError(500, "Failed to build the order report");
    }
  }),

  getInventoryReport: asyncHandler(async (req, res) => {
    try {
      const { categoryId, limit } = req.query;

      logger.info("Get inventory report endpoint called", { categoryId });

      const report = await ReportService.getInventoryReport({
        categoryId,
        limit,
      });

      return okResponse({
        res,
        data: report,
        message: "Inventory report retrieved successfully",
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error("Get inventory report endpoint error", {
        error: error?.message,
      });

      throw new ApiError(500, "Failed to build the inventory report");
    }
  }),
};
