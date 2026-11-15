// src/services/recent_order_popup.service.js
//
// The recent-order pop-up's settings (F-09.09), admin side. The public
// read — settings plus the orders to show — is StorefrontService's.

import { RecentOrderPopupRepository } from "../repository/recent_order_popup.repository.js";
import { RecentOrderPopupMapper } from "../mapper/recent_order_popup.mapper.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// 42P01 undefined_table / 42703 undefined_column: one of the pop-up
// migrations (036, 040) has not been run on this database yet.
const notMigrated = (error) => error?.code === "42P01" || error?.code === "42703";

const notMigratedError = () =>
  ApiError.serviceUnavailable(
    "The pop-up settings are not set up on this database yet. Run the database migrations.",
    "POPUP_NOT_MIGRATED",
  );

export const RecentOrderPopupService = {
  async getSettings() {
    try {
      return RecentOrderPopupMapper.toSettings(await RecentOrderPopupRepository.get());
    } catch (error) {
      if (notMigrated(error)) {
        throw notMigratedError();
      }

      logger.error("RecentOrderPopupService.getSettings failed", { error: error?.message });
      throw new ApiError(500, "Failed to load the pop-up settings");
    }
  },

  async updateSettings(settings) {
    try {
      return RecentOrderPopupMapper.toSettings(await RecentOrderPopupRepository.save(settings));
    } catch (error) {
      if (notMigrated(error)) {
        throw notMigratedError();
      }

      logger.error("RecentOrderPopupService.updateSettings failed", { error: error?.message });
      throw new ApiError(500, "Failed to save the pop-up settings");
    }
  },
};
