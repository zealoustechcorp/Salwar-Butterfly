/**
 * Centralised, validated environment configuration.
 *
 * Values are loaded by:
 * node --env-file=.env
 *
 * See package.json scripts.
 */

// ============================================================
// REQUIRED ENVIRONMENT VARIABLES
// ============================================================

const required = [
  "DATABASE_URL",
  "JWT_SECRET",

  // Cloudinary
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// ============================================================
// ENVIRONMENT
// ============================================================

const nodeEnv = process.env.NODE_ENV ?? "development";

const allowedEnvironments = ["development", "test", "production"];

if (!allowedEnvironments.includes(nodeEnv)) {
  throw new Error(
    `Invalid NODE_ENV: ${nodeEnv}. ` +
      `Expected development, test, or production.`,
  );
}

// ============================================================
// PORT
// ============================================================

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid port number between 1 and 65535");
}

// ============================================================
// JWT
// ============================================================

const jwtSecret = process.env.JWT_SECRET;

if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// ============================================================
// CORS
// ============================================================

const corsOrigin =
  process.env.CORS_ORIGIN ??
  (nodeEnv === "production" ? "" : "http://localhost:3000");

// Never silently allow all origins in production.
if (nodeEnv === "production" && !corsOrigin) {
  throw new Error("CORS_ORIGIN must be configured in production");
}

// ============================================================
// JWT EXPIRATION
// ============================================================

const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "1h";

// ============================================================
// CLOUDINARY
// ============================================================

// ============================================================
// CLOUDINARY
// ============================================================

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudinaryCloudName) {
  throw new Error(
    "Missing required environment variable: CLOUDINARY_CLOUD_NAME",
  );
}

if (!cloudinaryApiKey) {
  throw new Error("Missing required environment variable: CLOUDINARY_API_KEY");
}

if (!cloudinaryApiSecret) {
  throw new Error(
    "Missing required environment variable: CLOUDINARY_API_SECRET",
  );
}

// ============================================================
// EXPORT CONFIG
// ============================================================

export const env = Object.freeze({
  // ==========================================================
  // APPLICATION
  // ==========================================================

  nodeEnv,
  isProd: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port,

  // ==========================================================
  // DATABASE
  // ==========================================================

  databaseUrl: process.env.DATABASE_URL,

  pgCaCertPath: process.env.PG_CA_CERT_PATH ?? null,

  // ==========================================================
  // CORS
  // ==========================================================

  corsOrigin,

  // ==========================================================
  // JWT
  // ==========================================================

  jwtSecret,
  jwtExpiresIn,

  // ==========================================================
  // CLOUDINARY
  // ==========================================================

  cloudinary: Object.freeze({
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
  }),
});
