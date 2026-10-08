// src/controllers/size_chart.controller.js
//
// The shop's published size charts (F-06), admin side.
//
// The public read is not here. It lives on StorefrontController, which
// is the GET-only reader anonymous callers reach — see
// routes/storefront.routes.js.

import { SizeChartService } from "../services/size_chart.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse, createdResponse } from "../utils/apiResponse.js";

const list = (res, charts, message) =>
  okResponse({
    res,
    data: charts,
    message,
    meta: {
      counts: {
        total: charts.length,
        published: charts.filter((chart) => chart.active).length,
      },
    },
  });

export const SizeChartController = {
  /** GET /api/sizeCharts/getSizeCharts */
  getSizeCharts: asyncHandler(async (req, res) => {
    const charts = await SizeChartService.getAll();

    return list(res, charts, "Size charts fetched successfully");
  }),

  /** GET /api/sizeCharts/getSizeChartById/:id */
  getSizeChartById: asyncHandler(async (req, res) => {
    const chart = await SizeChartService.getById(req.params.id);

    return okResponse({
      res,
      data: chart,
      message: "Size chart fetched successfully",
    });
  }),

  /** POST /api/sizeCharts/createSizeChart */
  createSizeChart: asyncHandler(async (req, res) => {
    const chart = await SizeChartService.create(req.body);

    return createdResponse({
      res,
      data: chart,
      message: "Size chart created successfully",
    });
  }),

  /** PUT /api/sizeCharts/updateSizeChart/:id */
  updateSizeChart: asyncHandler(async (req, res) => {
    const chart = await SizeChartService.update(req.params.id, req.body);

    return okResponse({
      res,
      data: chart,
      message: "Size chart updated successfully",
    });
  }),

  /** PATCH /api/sizeCharts/setSizeChartActive/:id */
  setActive: asyncHandler(async (req, res) => {
    const chart = await SizeChartService.setActive(
      req.params.id,
      req.body.active,
    );

    return okResponse({
      res,
      data: chart,
      message: chart.active
        ? "Size chart published"
        : "Size chart hidden from the storefront",
    });
  }),

  /**
   * PATCH /api/sizeCharts/reorderSizeCharts
   *
   * Returns every chart in its new order, because a reorder changes rows
   * the caller did not name and a client applying a delta locally would
   * not know which.
   */
  reorder: asyncHandler(async (req, res) => {
    const charts = await SizeChartService.reorder(req.body.ids);

    return list(res, charts, "Size charts reordered successfully");
  }),

  /**
   * DELETE /api/sizeCharts/deleteSizeChart/:id
   *
   * Returns what is left, for the same reason as the reorder: deleting
   * one leaves gaps in the print order that the list makes plain.
   */
  deleteSizeChart: asyncHandler(async (req, res) => {
    const charts = await SizeChartService.remove(req.params.id);

    return list(res, charts, "Size chart deleted successfully");
  }),
};
