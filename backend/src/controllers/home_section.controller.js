// src/controllers/home_section.controller.js
//
// The hand-picked shelves on the home page (F-06), admin side.
//
// The public read is not here. It lives on StorefrontController — see
// routes/storefront.routes.js.

import { HomeSectionService } from "../services/home_section.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse, createdResponse } from "../utils/apiResponse.js";

/**
 * Reorder and delete answer with the whole list, since both move rows the
 * caller did not name. Create, update and the switch answer with the one
 * shelf, picks included.
 */
const list = (res, sections, message) =>
  okResponse({
    res,
    data: sections,
    message,
    meta: {
      counts: {
        total: sections.length,
        active: sections.filter((section) => section.active).length,
        live: sections.filter((section) => section.isLive).length,
      },
    },
  });

export const HomeSectionController = {
  /** GET /api/homeSections/getHomeSections */
  getHomeSections: asyncHandler(async (req, res) => {
    const sections = await HomeSectionService.getAll();

    return list(res, sections, "Home page sections fetched successfully");
  }),

  /** GET /api/homeSections/getHomeSectionById/:id */
  getHomeSectionById: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.getById(req.params.id);

    return okResponse({
      res,
      data: section,
      message: "Section fetched successfully",
    });
  }),

  /**
   * POST /api/homeSections/createHomeSection
   *
   * { title, subtitle?, slug?, startsAt?, endsAt?, active?, productIds }
   */
  createHomeSection: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.create(req.body);

    return createdResponse({
      res,
      data: section,
      message: "Section added",
    });
  }),

  /** PUT /api/homeSections/updateHomeSection/:id — a full replace. */
  updateHomeSection: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.update(req.params.id, req.body);

    return okResponse({
      res,
      data: section,
      message: "Section updated successfully",
    });
  }),

  /** PATCH /api/homeSections/setHomeSectionActive/:id */
  setActive: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.setActive(
      req.params.id,
      req.body.active,
    );

    return okResponse({
      res,
      data: section,
      message: section.active
        ? "Section switched on"
        : "Section hidden from the home page",
    });
  }),

  /** PATCH /api/homeSections/reorderHomeSections */
  reorder: asyncHandler(async (req, res) => {
    const sections = await HomeSectionService.reorder(req.body.ids);

    return list(res, sections, "Sections reordered successfully");
  }),

  /** DELETE /api/homeSections/deleteHomeSection/:id */
  deleteHomeSection: asyncHandler(async (req, res) => {
    const sections = await HomeSectionService.remove(req.params.id);

    return list(res, sections, "Section deleted successfully");
  }),
};
