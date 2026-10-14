import morgan from "morgan";
import { logger } from "../utils/logger.js";
import { redactUrl } from "../utils/redactUrl.js";

const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export const requestLogger = morgan(
  (tokens, req, res) =>
    JSON.stringify({
      method: tokens.method(req, res),
      // Query-string credentials — Meta's hub.verify_token above all —
      // are replaced before the line is written. See utils/redactUrl.js.
      url: redactUrl(req.originalUrl),
      status: Number(tokens.status(req, res)),
      responseTime: `${tokens["response-time"](req, res)}ms`,
      ip: req.ip,
      userAgent: tokens["user-agent"](req, res),
    }),
  {
    stream,
  },
);
