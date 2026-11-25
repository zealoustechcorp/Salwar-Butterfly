// src/repository/recent_order_popup.repository.js
//
// The recent-order pop-up's settings (F-09.09), admin side.
//
// One row, id = 1 (036/040). The orders the pop-up shows are not read here —
// that is a public read and lives in storefront.repository.js with the
// other columns the world may see.

import { query, withTransaction } from "../config/db.js";
import { logger } from "../utils/logger.js";

const handleDatabaseError = (error, operation) => {
  logger.error(`Recent order popup repository error: ${operation}`, {
    operation,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

const COLUMNS = `
  enabled,
  lookback_days,
  display_mode,
  visible_seconds,
  gap_seconds,
  updated_at
`;

export const RecentOrderPopupRepository = {
  /** The settings row, or null if the migrations have not been run. */
  async get() {
    try {
      const result = await query(
        `SELECT ${COLUMNS} FROM recent_order_popup_settings WHERE id = 1`,
      );
      return result.rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "get");
    }
  },

  /**
   * A full replace of the settings. An upsert so a database whose seed row
   * was deleted by hand heals itself on the next save.
   *
   * The primary key is the table's only unique key, so ON DUPLICATE KEY
   * fires exactly where Postgres's ON CONFLICT (id) did. The row is read
   * back in the same transaction rather than RETURNed, because RETURNING
   * on an upsert that took the UPDATE branch is not something to rely on.
   */
  async save({ enabled, lookbackDays, displayMode, visibleSeconds, gapSeconds }) {
    return withTransaction(async (client) => {
      await client.query(
        `INSERT INTO recent_order_popup_settings
           (id, enabled, lookback_days, display_mode, visible_seconds, gap_seconds, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, NOW(6))
         ON DUPLICATE KEY UPDATE
           enabled         = VALUES(enabled),
           lookback_days   = VALUES(lookback_days),
           display_mode    = VALUES(display_mode),
           visible_seconds = VALUES(visible_seconds),
           gap_seconds     = VALUES(gap_seconds),
           updated_at      = NOW(6)`,
        [enabled, lookbackDays, displayMode, visibleSeconds, gapSeconds],
      );
      const result = await client.query(
        `SELECT ${COLUMNS} FROM recent_order_popup_settings WHERE id = 1`,
      );
      return result.rows[0];
    }).catch((error) => {
      throw handleDatabaseError(error, "save");
    });
  },
};
