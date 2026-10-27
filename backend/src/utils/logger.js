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
// ENVIRONMENT
// ============================================================

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Whether to write log files at all.
 *
 * Off in production by default. A host's disk is wiped on every deploy
 * or restart, so files there were never the record they looked like; the
 * process logs JSON lines to stdout instead, which every host captures
 * and keeps (and can forward to a log service). Off in tests, whose
 * short-lived, force-exited processes were the main thing breaking the
 * files. On for local development. LOG_TO_FILES=on|off overrides.
 */
const LOG_TO_FILES = process.env.LOG_TO_FILES
  ? process.env.LOG_TO_FILES === "on"
  : NODE_ENV === "development";

if (LOG_TO_FILES && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, {
    recursive: true,
  });
}

const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");

// ============================================================
// LOG FORMAT
// ============================================================

/**
 * Applies SENSITIVE_FIELDS (below) to a JSON log line.
 *
 * The console format always redacted, through safeStringify; the JSON
 * format did not, so a password or token passed in a log call's meta was
 * written to the log files in clear. JSON is now what production logs
 * (to stdout, for the host to keep), so it redacts the same way. Winston
 * keeps its own bookkeeping under Symbol keys, which Object.keys skips,
 * so those are left untouched.
 */
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === "level" || key === "message" || key === "timestamp") continue;

    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      info[key] = "[REDACTED]";
    } else if (typeof info[key] === "object" && info[key] !== null) {
      try {
        info[key] = JSON.parse(safeStringify(info[key]));
      } catch {
        info[key] = "[Unserializable]";
      }
    }
  }

  return info;
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
  }),

  winston.format.errors({
    stack: true,
  }),

  redactFormat(),

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

/**
 * Field names whose values never reach a log file.
 *
 * Stored lower-cased, and compared against a lower-cased key, so that
 * `accessToken`, `accesstoken` and `ACCESS_TOKEN`-ish spellings are all
 * caught by one entry. That symmetry is the whole point and it was
 * missing until now: the comparison lower-cased the key but the list
 * held camelCase, so `accessToken`, `refreshToken`, `currentPassword`,
 * `newPassword`, `confirmPassword`, `clientSecret`, `apiKey`,
 * `creditCard` and `cardNumber` matched nothing and were written out in
 * full. Only the entries that happened to already be lower-case worked.
 *
 * Anything added here must therefore be lower-case, or it is a comment
 * rather than a rule.
 *
 * A Set at module scope rather than an array rebuilt inside the
 * replacer: the replacer runs once per key of every object ever logged,
 * and it was allocating a sixteen-element array each time.
 */
const SENSITIVE_FIELDS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "secret",
  "clientsecret",
  "apikey",
  "creditcard",
  "cardnumber",
  "cvv",
  "otp",

  // WhatsApp (F-WA). The access token is a permanent system-user
  // credential that can send messages as the shop, and the app secret
  // signs Meta's inbound webhooks — leaking either is leaking the
  // channel itself.
  "whatsapptoken",
  "whatsappaccesstoken",
  "appsecret",
  "whatsappappsecret",
  "verifytoken",
  // The handshake's own spelling, should req.query ever be logged whole.
  // URLs are scrubbed separately — see utils/redactUrl.js.
  "hub.verify_token",
]);

const safeStringify = (value) => {
  try {
    const seen = new WeakSet();

    return JSON.stringify(value, (key, currentValue) => {
      // --------------------------------------------------------
      // REMOVE SENSITIVE INFORMATION
      // --------------------------------------------------------

      if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
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

    // Not compressed. Every process that opens these files — the dev
    // server, each test run, every one-off script — gzips the previous
    // day's file when it notices the date has changed, then deletes the
    // original. A process that exits mid-way (tests force-exit; scripts
    // finish in a second) left an empty .gz and no original: 83 of 171
    // archives were empty, the 2026-10-19 bulk-upload logs among them.
    // Uncompressed files cost disk, which maxSize/maxFiles already cap.
    zippedArchive: false,

    maxSize,

    maxFiles,

    format: jsonFormat,
  });
};

// ============================================================
// TRANSPORTS
// ============================================================

const fileTransports = () => [
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

const transports = LOG_TO_FILES ? fileTransports() : [];

// ============================================================
// CONSOLE
// ============================================================
//
// In production the console is the log: one redacted JSON object per
// line, which the host's log viewer can search and filter. Elsewhere it
// is the coloured, human-readable line.

transports.push(
  new winston.transports.Console({
    level: LOG_LEVEL,
    format: NODE_ENV === "production" ? jsonFormat : consoleFormat,
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
