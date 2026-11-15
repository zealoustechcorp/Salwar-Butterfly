// src/controllers/recent_order_popup.controller.js
//
// The recent-order pop-up's settings (F-09.09), admin side.
//
// The public read is not here. It lives on StorefrontController — see
// routes/storefront.routes.js.

import { RecentOrderPopupService } from "../services/recent_order_popup.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { okResponse } from "../utils/apiResponse.js";

export const RecentOrderPopupController = {
  /** GET /api/recentOrderPopup/getSettings */
  getSettings: asyncHandler(async (req, res) => {
    const settings = await RecentOrderPopupService.getSettings();

    return okResponse({ res, data: settings, message: "Pop-up settings fetched successfully" });
  }),

  /** PUT /api/recentOrderPopup/updateSettings — { enabled, lookbackDays, displayMode, visibleSeconds, intervalSeconds, closeDelaySeconds } */
  updateSettings: asyncHandler(async (req, res) => {
    const settings = await RecentOrderPopupService.updateSettings(req.body);

    return okResponse({ res, data: settings, message: "Pop-up settings saved" });
  }),
};
