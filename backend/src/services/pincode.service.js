// src/services/pincode.service.js
//
// PIN code lookup for the address forms (F-05.03, F-08.05).
//
// A shopper types six digits and the form fills in the city and state
// and offers the post office areas under that code. The answer comes
// from src/data/pincodes.json, India Post's directory reduced to what the
// form uses — see scripts/buildPincodes.js for where it comes from and
// how to rebuild it.
//
// Read from a file rather than the database, deliberately. The data is
// public, read-only, the same for every caller and changes a few rows a
// month; a table for it would be a migration and an import job on the
// shared database to serve something that fits in 2 MB of memory.
//
// Loaded on first use rather than at boot, so a process that never
// serves an address form (the worker, a script) never pays for it.
//
// The lookup is a convenience, never a rule. A pincode missing from the
// directory is answered 404 here, and the form simply leaves the fields
// for the shopper to type — address.rules.js still accepts any six-digit
// code, because a pincode opened last month is a real address that this
// file has not heard of yet.

import { readFile } from "node:fs/promises";

import { PINCODE_REGEX } from "../validators/address.rules.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

const DATA_FILE = new URL("../data/pincodes.json", import.meta.url);

/** One in-flight load shared by every caller, so a cold burst reads once. */
let loading = null;

const load = () => {
  loading ??= readFile(DATA_FILE, "utf8")
    .then((text) => {
      const data = JSON.parse(text);

      logger.info("Pincode directory loaded", {
        pincodes: Object.keys(data.pincodes).length,
        source: data.source,
        builtAt: data.builtAt,
      });

      return data;
    })
    .catch((error) => {
      // Not cached. A missing or corrupt file is a deploy problem, and
      // the next request should try again once it is fixed rather than
      // keep serving the failure until a restart.
      loading = null;
      throw error;
    });

  return loading;
};

export const PincodeService = {
  /**
   * The city, state and post office areas for one pincode.
   *
   * @returns {Promise<{ pincode: string, city: string, state: string,
   *          areas: string[] }>}
   */
  async lookup(raw) {
    const pincode = String(raw ?? "").trim();

    if (!PINCODE_REGEX.test(pincode)) {
      throw new ApiError(400, "PIN code must be 6 digits");
    }

    let data;

    try {
      data = await load();
    } catch (error) {
      logger.error("PincodeService.lookup could not load the directory", {
        error: error?.message,
      });

      throw new ApiError(500, "PIN code lookup is unavailable");
    }

    const entry = data.pincodes[pincode];

    if (!entry) {
      throw new ApiError(404, "We could not find that PIN code");
    }

    const [stateIndex, city, areas] = entry;

    return { pincode, city, state: data.states[stateIndex], areas };
  },
};
