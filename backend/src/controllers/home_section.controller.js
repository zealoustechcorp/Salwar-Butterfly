// src/controllers/home_section.controller.js
//
// The home page's one hand-picked section (F-06), admin side.
//
// The public read is not here. It lives on StorefrontController — see
// routes/storefront.routes.js.

import { HomeSectionService } from "../services/home_section.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";

export const HomeSectionController = {
  /** GET /api/homeSections/getHomeSections — the section, with its picks. */
  getHomeSections: asyncHandler(async (req, res) => {
    const sections = await HomeSectionService.getAll();

    return okResponse({
      res,
      data: sections,
      message: "Home page sections fetched successfully",
    });
  }),

  /** GET /api/homeSections/getHomeSection/:slug */
  getHomeSection: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.getBySlug(req.params.slug);

    return okResponse({ res, data: section, message: "Section fetched successfully" });
  }),

  /** PUT /api/homeSections/updateHomeSection/:slug — { title, subtitle?, productIds } */
  updateHomeSection: asyncHandler(async (req, res) => {
    const section = await HomeSectionService.update(req.params.slug, req.body);

    return okResponse({ res, data: section, message: "Section saved" });
  }),

  /** GET /api/homeSections/getProductSections/:productId */
  getProductSections: asyncHandler(async (req, res) => {
    const data = await HomeSectionService.getProductSections(req.params.productId);

    return okResponse({ res, data, message: "Product sections fetched successfully" });
  }),

  /** PUT /api/homeSections/setProductSections/:productId — { sections: [...] } */
  setProductSections: asyncHandler(async (req, res) => {
    const data = await HomeSectionService.setProductSections(
      req.params.productId,
      req.body.sections,
    );

    return okResponse({ res, data, message: "Home page sections updated" });
  }),
};
