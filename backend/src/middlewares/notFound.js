// src/middlewares/notFound.js

import { ApiError } from "../utils/ApiError.js";
import { redactUrl } from "../utils/redactUrl.js";

export const notFound = (req, res, next) => {
  // Redacted because this message is both logged and sent back: the
  // WhatsApp router is only mounted when receipts are configured, so a
  // handshake against an unconfigured API lands here with its verify
  // token in the URL.
  next(
    new ApiError(404, `Route not found: ${req.method} ${redactUrl(req.originalUrl)}`),
  );
};
