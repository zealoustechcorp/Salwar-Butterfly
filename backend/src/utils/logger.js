// src/utils/logger.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

// ============================================================
// PATH CONFIGURATION
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.resolve(__dirname, "../../logs");

// ============================================================
// CREATE LOG DIRECTORY
// ============================================================

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, {
    recursive: true,
  });
}

// ============================================================
// ENVIRONMENT
// ============================================================

const NODE_ENV = process.env.NODE_ENV || "development";

const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");

// ============================================================
// LOG FORMAT
// ============================================================

const jsonFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
  }),

  winston.format.errors({
    stack: true,
  }),

  winston.format.json(),
);

// ============================================================
// CONSOLE FORMAT
// ============================================================

const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),

  winston.format.errors({
    stack: true,
  }),

  winston.format.colorize(),

  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let output = `[${timestamp}] ${level}: ${message}`;

    if (Object.keys(meta).length > 0) {
      output += ` ${safeStringify(meta)}`;
    }

    return output;
  }),
);

// ============================================================
// SAFE JSON SERIALIZER
// ============================================================

const safeStringify = (value) => {
  try {
    const seen = new WeakSet();

    return JSON.stringify(value, (key, currentValue) => {
      // --------------------------------------------------------
      // REMOVE SENSITIVE INFORMATION
      // --------------------------------------------------------

      const sensitiveFields = [
        "password",
        "currentPassword",
        "newPassword",
        "confirmPassword",
        "token",
        "accessToken",
        "refreshToken",
        "authorization",
        "cookie",
        "secret",
        "clientSecret",
        "apiKey",
        "creditCard",
        "cardNumber",
        "cvv",
        "otp",
      ];

      if (sensitiveFields.includes(key.toLowerCase())) {
        return "[REDACTED]";
      }

      // --------------------------------------------------------
      // CIRCULAR REFERENCE PROTECTION
      // --------------------------------------------------------

      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }

        seen.add(currentValue);
      }

      return currentValue;
    });
  } catch {
    return "[Unserializable]";
  }
};

// ============================================================
// DAILY ROTATING TRANSPORT
// ============================================================

const createRotateTransport = ({
  filename,
  level,
  maxFiles = "14d",
  maxSize = "20m",
}) => {
  return new DailyRotateFile({
    dirname: logDir,
    filename,
    level,

    datePattern: "YYYY-MM-DD",

    zippedArchive: true,

    maxSize,

    maxFiles,

    format: jsonFormat,
  });
};

// ============================================================
// TRANSPORTS
// ============================================================

const transports = [
  // ----------------------------------------------------------
  // ALL APPLICATION LOGS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "app-%DATE%.log",
    level: LOG_LEVEL,
    maxFiles: "30d",
  }),

  // ----------------------------------------------------------
  // ERRORS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "error-%DATE%.log",
    level: "error",
    maxFiles: "60d",
  }),

  // ----------------------------------------------------------
  // WARNINGS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "warn-%DATE%.log",
    level: "warn",
    maxFiles: "30d",
  }),

  // ----------------------------------------------------------
  // HTTP REQUESTS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "http-%DATE%.log",
    level: "http",
    maxFiles: "14d",
  }),

  // ----------------------------------------------------------
  // DATABASE / QUERY LOGS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "query-%DATE%.log",
    level: "debug",
    maxFiles: "7d",
  }),

  // ----------------------------------------------------------
  // SECURITY / AUTH LOGS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "security-%DATE%.log",
    level: "warn",
    maxFiles: "90d",
  }),

  // ----------------------------------------------------------
  // AUDIT LOGS
  // ----------------------------------------------------------

  createRotateTransport({
    filename: "audit-%DATE%.log",
    level: "info",
    maxFiles: "180d",
  }),
];

// ============================================================
// CONSOLE
// ============================================================

transports.push(
  new winston.transports.Console({
    level: LOG_LEVEL,
    format: consoleFormat,
  }),
);

// ============================================================
// WINSTON LOGGER
// ============================================================

const winstonLogger = winston.createLogger({
  level: LOG_LEVEL,

  defaultMeta: {
    service: "salwar-butterfly-api",
    environment: NODE_ENV,
  },

  transports,

  exitOnError: false,
});

// ============================================================
// ERROR NORMALIZER
// ============================================================

const normalizeError = (error) => {
  if (!error) {
    return {};
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      details: error.details,
    };
  }

  if (typeof error === "object") {
    return error;
  }

  return {
    message: String(error),
  };
};

// ============================================================
// LOGGER
// ============================================================

export const logger = {
  // ==========================================================
  // DEBUG
  // ==========================================================

  debug(message, meta = {}) {
    winstonLogger.debug(message, meta);
  },

  // ==========================================================
  // INFO
  // ==========================================================

  info(message, meta = {}) {
    winstonLogger.info(message, meta);
  },

  // ==========================================================
  // HTTP
  // ==========================================================

  http(message, meta = {}) {
    winstonLogger.log({
      level: "http",
      message,
      ...meta,
    });
  },

  // ==========================================================
  // WARN
  // ==========================================================

  warn(message, meta = {}) {
    winstonLogger.warn(message, meta);
  },

  // ==========================================================
  // ERROR
  // ==========================================================

  error(message, error = {}, meta = {}) {
    const normalizedError = normalizeError(error);

    winstonLogger.error(message, {
      ...meta,
      error: normalizedError,
    });
  },

  // ==========================================================
  // FATAL
  // ==========================================================

  fatal(message, error = {}, meta = {}) {
    const normalizedError = normalizeError(error);

    winstonLogger.error(message, {
      ...meta,
      severity: "fatal",
      error: normalizedError,
    });
  },

  // ==========================================================
  // DATABASE QUERY
  // ==========================================================

  query(sql, params = [], duration = null, meta = {}) {
    winstonLogger.log({
      level: "debug",
      message: "Database query executed",

      query: {
        sql,
        params: safeStringify(params),
        durationMs: duration,
      },

      ...meta,
    });
  },

  // ==========================================================
  // DATABASE ERROR
  // ==========================================================

  databaseError(message, error, meta = {}) {
    winstonLogger.error(message, {
      ...meta,

      error: normalizeError(error),

      database: {
        code: error?.code,
        detail: error?.detail,
        constraint: error?.constraint,
        table: error?.table,
        column: error?.column,
      },
    });
  },

  // ==========================================================
  // SECURITY
  // ==========================================================

  security(message, meta = {}) {
    winstonLogger.warn(message, {
      securityEvent: true,
      ...meta,
    });
  },

  // ==========================================================
  // AUDIT
  // ==========================================================

  audit(action, meta = {}) {
    winstonLogger.info(action, {
      auditEvent: true,
      ...meta,
    });
  },

  // ==========================================================
  // REQUEST
  // ==========================================================

  request({
    method,
    url,
    statusCode,
    duration,
    ip,
    userAgent,
    requestId,
    userId,
  }) {
    winstonLogger.log({
      level: "http",
      message: "HTTP request",

      request: {
        method,
        url,
        statusCode,
        durationMs: duration,
        ip,
        userAgent,
        requestId,
        userId,
      },
    });
  },

  // ==========================================================
  // STREAM ACCESS
  // ==========================================================

  stream: {
    write(message) {
      winstonLogger.http(message.trim());

      return true;
    },
  },

  // ==========================================================
  // RAW WINSTON LOGGER
  // ==========================================================

  raw: winstonLogger,
};

// ============================================================
// UNCAUGHT EXCEPTIONS
// ============================================================

winstonLogger.exceptions.handle(
  createRotateTransport({
    filename: "exceptions-%DATE%.log",
    level: "error",
    maxFiles: "30d",
  }),
);

// ============================================================
// UNHANDLED PROMISE REJECTIONS
// ============================================================

winstonLogger.rejections.handle(
  createRotateTransport({
    filename: "rejections-%DATE%.log",
    level: "error",
    maxFiles: "30d",
  }),
);

// ============================================================
// PROCESS EVENTS
// ============================================================

process.on("uncaughtException", (error) => {
  logger.fatal("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal("Unhandled promise rejection", reason);
});

// ============================================================
// EXPORT DEFAULT
// ============================================================

export default logger;
