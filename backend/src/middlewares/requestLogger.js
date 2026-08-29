import morgan from "morgan";
import { logger } from "../utils/logger.js";

const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export const requestLogger = morgan(
  (tokens, req, res) =>
    JSON.stringify({
      method: tokens.method(req, res),
      url: req.originalUrl,
      status: Number(tokens.status(req, res)),
      responseTime: `${tokens["response-time"](req, res)}ms`,
      ip: req.ip,
      userAgent: tokens["user-agent"](req, res),
    }),
  {
    stream,
  },
);
