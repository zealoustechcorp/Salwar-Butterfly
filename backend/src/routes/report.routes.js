// src/routes/report.routes.js
//
// Dashboard and reports (F-11).
//
// Every route here is a GET, and every one of them is admin-only —
// guarded at the mount in routes/index.js rather than route by route,
// because there is no version of any of these figures a shopper should
// see. A revenue total is the shop's private business, and the order
// report carries customers' names, emails and addresses in bulk.
//
// Read-only by nature: a report that could change something would be a
// different feature. F-11.06 — the reviews an admin can add, edit and
// delete — is a table with writes, so it lives in review.routes.js
// next door rather than being bolted on here.

import express from "express";

import { ReportController } from "../controllers/report.controller.js";
import {
  validateInventoryReportQuery,
  validateOrderReportQuery,
  validateSalesReportQuery,
} from "../validators/report.validator.js";

const router = express.Router();

// The admin landing screen (F-11.01, F-11.02): orders and revenue for
// today, this week and this month, what the catalogue holds, and the
// sizes that need reordering. One request, so the halves of one screen
// cannot describe two different moments.
router.get("/getDashboard", ReportController.getDashboard);

// Orders and revenue over time (F-11.02, F-11.05), bucketed by day,
// week or month, with the best-sellers for the same range. Buckets with
// no orders come back as zeroes rather than as gaps — a chart drawn from
// a plain GROUP BY closes those, and three quiet days become a straight
// line between two spikes.
router.get(
  "/getSalesReport",
  validateSalesReportQuery,
  ReportController.getSalesReport,
);

// The order summary with customer details and quantities (F-11.03).
// The order queue's own query with a date range on it, paginated the
// same way, so the two screens cannot fall out of step.
router.get(
  "/getOrderReport",
  validateOrderReportQuery,
  ReportController.getOrderReport,
);

// Product and inventory summary (F-11.04): stock by status, a
// per-category breakdown, and the sizes that are low or gone.
router.get(
  "/getInventoryReport",
  validateInventoryReportQuery,
  ReportController.getInventoryReport,
);

export default router;
