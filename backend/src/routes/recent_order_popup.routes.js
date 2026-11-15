// src/routes/recent_order_popup.routes.js
//
// The "someone just bought this" pop-up on the storefront (F-09.09),
// admin side: the on/off switch, the look-back window, how long each
// pop-up stays up and the gap between pop-ups. The first one always comes 5 seconds after a page loads.
//
// Admin-only in its entirety, guarded at the mount in routes/index.js.
// The shopper's read is `GET /storefront/getRecentOrders`.

import express from "express";

import { RecentOrderPopupController } from "../controllers/recent_order_popup.controller.js";
import { validatePopupSettings } from "../validators/recent_order_popup.validator.js";

const router = express.Router();

router.get("/getSettings", RecentOrderPopupController.getSettings);

// A full replace of the four settings.
router.put("/updateSettings", validatePopupSettings, RecentOrderPopupController.updateSettings);

export default router;
