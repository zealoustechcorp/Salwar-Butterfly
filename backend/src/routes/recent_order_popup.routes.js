// src/routes/recent_order_popup.routes.js
//
// The "someone just bought this" pop-up on the storefront (F-09.09),
// admin side: the on/off switch, the look-back window, the display mode
// (until closed / timer), how long a pop-up shows and the gap before the next.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// The shopper's read is `GET /storefront/getRecentOrders`.

import express from "express";

import { RecentOrderPopupController } from "../controllers/recent_order_popup.controller.js";
import { validatePopupSettings } from "../validators/recent_order_popup.validator.js";

const router = express.Router();

router.get("/getSettings", RecentOrderPopupController.getSettings);

// A full replace of the settings.
router.put("/updateSettings", validatePopupSettings, RecentOrderPopupController.updateSettings);

export default router;
