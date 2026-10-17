// src/routes/home_section.routes.js
//
// The hand-picked shelves on the home page (F-06), admin side.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// The shopper's read is `GET /storefront/getHomeSections`, in the GET-only
// router, where a shelf loses its id, position, active flag and dates and
// keeps only what is printed.

import express from "express";

import { HomeSectionController } from "../controllers/home_section.controller.js";
import {
  validateReorder,
  validateSectionBody,
  validateSectionIdParam,
  validateSetActive,
} from "../validators/home_section.validator.js";

const router = express.Router();

router.get("/getHomeSections", HomeSectionController.getHomeSections);

router.get(
  "/getHomeSectionById/:id",
  validateSectionIdParam,
  HomeSectionController.getHomeSectionById,
);

router.post(
  "/createHomeSection",
  validateSectionBody,
  HomeSectionController.createHomeSection,
);

// A full replace of the fields and the picked pieces.
router.put(
  "/updateHomeSection/:id",
  validateSectionIdParam,
  validateSectionBody,
  HomeSectionController.updateHomeSection,
);

// The switch in the admin row, separate so hiding a shelf does not mean
// re-sending its pieces.
router.patch(
  "/setHomeSectionActive/:id",
  validateSectionIdParam,
  validateSetActive,
  HomeSectionController.setActive,
);

// Takes the whole set — see the service for why.
router.patch(
  "/reorderHomeSections",
  validateReorder,
  HomeSectionController.reorder,
);

router.delete(
  "/deleteHomeSection/:id",
  validateSectionIdParam,
  HomeSectionController.deleteHomeSection,
);

export default router;
