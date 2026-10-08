// src/routes/size_chart.routes.js
//
// The shop's published size charts (F-06), admin side.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js
// with the rest of the catalogue's writers. Six of these seven endpoints
// change what a shopper reads next to a Buy button, so there is no
// public subset here worth carving out.
//
// The shopper's read is `GET /storefront/getSizeCharts`, in the GET-only
// router whose columns are named one at a time. That is where a chart
// loses its id, its position and its published flag — not here, and not
// by a filter downstream.

import express from "express";

import { SizeChartController } from "../controllers/size_chart.controller.js";
import {
  validateReorder,
  validateSetActive,
  validateSizeChartBody,
  validateSizeChartIdParam,
} from "../validators/size_chart.validator.js";

const router = express.Router();

router.get("/getSizeCharts", SizeChartController.getSizeCharts);

router.get(
  "/getSizeChartById/:id",
  validateSizeChartIdParam,
  SizeChartController.getSizeChartById,
);

router.post(
  "/createSizeChart",
  validateSizeChartBody,
  SizeChartController.createSizeChart,
);

// A full replace, not a patch: the caller is an editor holding the whole
// table, and there is no partial update of a measurement grid that means
// anything. See the repository.
router.put(
  "/updateSizeChart/:id",
  validateSizeChartIdParam,
  validateSizeChartBody,
  SizeChartController.updateSizeChart,
);

// The toggle in the admin row. Separate from the editor above it so that
// taking a chart down does not mean sending a measurement table.
router.patch(
  "/setSizeChartActive/:id",
  validateSizeChartIdParam,
  validateSetActive,
  SizeChartController.setActive,
);

// The order the charts are printed in, which is the order of the tabs a
// shopper sees. Takes the whole set — see the service for why a partial
// list is refused rather than half-applied.
router.patch(
  "/reorderSizeCharts",
  validateReorder,
  SizeChartController.reorder,
);

router.delete(
  "/deleteSizeChart/:id",
  validateSizeChartIdParam,
  SizeChartController.deleteSizeChart,
);

export default router;
