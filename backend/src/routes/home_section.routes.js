// src/routes/home_section.routes.js
//
// The two home page sections (F-06), admin side: "Best sellers" and a
// custom section, both fixed (029) and addressed by slug.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// There is no create, delete or reorder: the shop changes a section's name,
// description and pieces, and nothing else. The shopper's read is
// `GET /storefront/getHomeSections`.

import express from "express";

import { HomeSectionController } from "../controllers/home_section.controller.js";
import {
  validateProductIdParam,
  validateProductSections,
  validateSectionBody,
  validateSectionSlugParam,
} from "../validators/home_section.validator.js";

const router = express.Router();

router.get("/getHomeSections", HomeSectionController.getHomeSections);

router.get(
  "/getHomeSection/:slug",
  validateSectionSlugParam,
  HomeSectionController.getHomeSection,
);

// A full replace of the name, the description and the picked pieces.
router.put(
  "/updateHomeSection/:slug",
  validateSectionSlugParam,
  validateSectionBody,
  HomeSectionController.updateHomeSection,
);

// The checkboxes on a product's admin page.
router.get(
  "/getProductSections/:productId",
  validateProductIdParam,
  HomeSectionController.getProductSections,
);

router.put(
  "/setProductSections/:productId",
  validateProductIdParam,
  validateProductSections,
  HomeSectionController.setProductSections,
);

export default router;
