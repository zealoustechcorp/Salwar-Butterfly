// src/routes/inventory.routes.js
//
// Inventory (F-04) reads and writes product_variants — stock has always
// lived there. These routes exist because the question is different from
// the one the product screens ask: not "what sizes does this product
// have?" but "what across the catalogue is running out?"

import express from "express";

import { InventoryController } from "../controllers/inventory.controller.js";
import {
  validateAdjustStock,
  validateBulkAdjustStock,
  validateInventoryQuery,
  validateSetStock,
  validateVariantIdParam,
} from "../validators/inventory.validator.js";

const router = express.Router();

// The stock table: one row per size, filtered by stock status, searched
// by product name or size, and sorted lowest-stock-first by default.
router.get("/getInventory", validateInventoryQuery, InventoryController.getInventory);

// The tiles alone, for callers that show no table — the dashboard
// (F-11) reads this one.
router.get("/getInventorySummary", InventoryController.getSummary);

// A movement: "two more arrived", "one was damaged". Sent as a delta
// rather than a new total so two admins counting the same delivery both
// land, instead of the second overwriting the first.
router.patch(
  "/adjustStock/:id",
  validateVariantIdParam,
  validateAdjustStock,
  InventoryController.adjustStock,
);

// A stock-take: an absolute count. Send `expectedStockQuantity` with it
// and the write is refused if the row moved since the screen loaded.
router.patch(
  "/setStock/:id",
  validateVariantIdParam,
  validateSetStock,
  InventoryController.setStock,
);

// A whole delivery in one transaction — all of it applies or none does.
router.put(
  "/bulkAdjustStock",
  validateBulkAdjustStock,
  InventoryController.bulkAdjustStock,
);

export default router;
