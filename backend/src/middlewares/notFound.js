// src/middlewares/notFound.js

import { ApiError } from "../utils/ApiError.js";
import { redactUrl } from "../utils/redactUrl.js";

export const notFound = (req, res, next) => {
  // Redacted because this message is both logged and sent back, and a
  // request for a route that does not exist can still carry a token in
  // its query string.
  next(
    new ApiError(404, `Route not found: ${req.method} ${redactUrl(req.originalUrl)}`),
  );
};
