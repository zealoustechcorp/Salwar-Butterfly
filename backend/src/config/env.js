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
// RAZORPAY (F-10)
// ============================================================
//
// Optional, unlike everything above, and deliberately so. The shop was
// taking payment by hand long before a gateway existed and the admin
// "confirm payment" route is still there, so a backend with no keys is a
// working backend — it just cannot open a payment sheet. Making these
// required would mean nobody can run the API locally, or run the
// migrations, without a Razorpay account.
//
// What that costs is a mode where /payments exists but cannot work, so
// it is named rather than inferred: `razorpay.enabled` is checked once,
// at the top of the service, and turns into a 503 that says which
// variables are missing.
//
// The webhook secret is separate from the API secret because Razorpay
// issues it separately — it is set on the dashboard when the webhook URL
// is registered. Without it, deliveries cannot be verified and are
// refused; the checkout return path still works, so this is the
// difference between "payment works" and "payment works even when the
// shopper closes the tab before the redirect".

const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? null;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET ?? null;
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? null;

const razorpayEnabled = Boolean(razorpayKeyId && razorpayKeySecret);

// A key id names its own mode: rzp_test_* against Razorpay's sandbox,
// rzp_live_* against real money. Worth surfacing, because "why did the
// order not appear in our bank" has been answered by this line before.
const razorpayLive = Boolean(razorpayKeyId?.startsWith("rzp_live"));

// console, not the logger: logger.js imports this module, and importing
// it back would be a cycle. These run once, at boot.
if (!razorpayEnabled) {
  console.warn(
    "[env] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — " +
      "online payment is disabled; orders can still be confirmed by hand",
  );
} else if (!razorpayWebhookSecret) {
  console.warn(
    "[env] RAZORPAY_WEBHOOK_SECRET not set — webhook deliveries will be " +
      "refused; payment will only confirm on the checkout return",
  );
}

if (nodeEnv === "production" && razorpayEnabled && !razorpayLive) {
  console.warn("[env] running in production against Razorpay TEST keys");
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

  // ==========================================================
  // RAZORPAY
  // ==========================================================

  razorpay: Object.freeze({
    enabled: razorpayEnabled,
    live: razorpayLive,
    keyId: razorpayKeyId,
    keySecret: razorpayKeySecret,
    webhookSecret: razorpayWebhookSecret,
  }),
});
