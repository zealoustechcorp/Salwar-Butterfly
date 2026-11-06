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

  // Cloudflare R2 (image storage)
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
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
// CHECKOUT HOLD
// ============================================================
//
// How long a checkout draft holds its stock while the shopper is on the
// payment sheet. An order is not placed until it is paid for (see
// 031_order_number_on_payment.sql); until then the pieces are held for
// this long and no longer, after which the sweeper
// (src/queues/unpaid_order.sweeper.js) cancels the draft and puts them
// back. The Razorpay sheet is given the same deadline, so it closes
// itself before the hold runs out.

const checkoutHoldMinutes = Number(process.env.CHECKOUT_HOLD_MINUTES ?? 10);

if (!Number.isFinite(checkoutHoldMinutes) || checkoutHoldMinutes <= 0) {
  throw new Error("CHECKOUT_HOLD_MINUTES must be a positive number of minutes");
}

// ============================================================
// JWT
// ============================================================

const jwtSecret = process.env.JWT_SECRET;

if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// ============================================================
// DATABASE TLS
// ============================================================
//
// Optional. db.js always verifies the Postgres certificate; without this it
// verifies against Node's built-in public roots, which is right for Neon.
// Set it only for a provider that signs with its own private CA (Aiven).

// The PEM itself rather than a path to it, so the cert travels with the rest
// of the config and no file has to ship alongside the code. Accepts either a
// quoted multi-line value or a single line with literal \n escapes, which is
// all some hosting dashboards allow.
const pgCaCert = process.env.PG_CA_CERT?.replace(/\\n/g, "\n").trim() || null;

if (pgCaCert && !pgCaCert.includes("-----BEGIN CERTIFICATE-----")) {
  throw new Error(
    "PG_CA_CERT does not look like a PEM certificate — paste the whole file, " +
      "-----BEGIN CERTIFICATE----- through -----END CERTIFICATE-----.",
  );
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
// TOKEN LIFETIMES
// ============================================================
//
// A session is two tokens with deliberately different lifetimes, and
// the asymmetry is the point.
//
// The access token cannot be revoked. It is a signed assertion the API
// verifies without consulting anything, which is what makes it fast and
// what makes it final: once issued, the only thing that ends it is its
// own `exp`. Fifteen minutes is the ceiling on what a stolen one is
// worth.
//
// The refresh token can be revoked, because a row in `refresh_tokens`
// stands behind it and logout deletes that row. It can therefore afford
// to live for a month — and it is the half the browser never lets
// JavaScript touch, since it arrives as an httpOnly cookie.
//
// Overriding these is supported but rarely wise. A long access TTL is
// the setting that quietly undoes the whole design: it is the number
// that decides how long a leaked token outlives the logout that was
// supposed to end it.
//
// JWT_EXPIRES_IN, which these replace, is no longer read. It described
// one token doing both jobs, and there is no honest single value for
// that — 24h, as it was set here, meant a stolen token survived a day
// of trying to revoke it.

const accessTokenTtl = process.env.ACCESS_TOKEN_TTL ?? "15m";
const refreshTokenTtl = process.env.REFRESH_TOKEN_TTL ?? "30d";

if (process.env.JWT_EXPIRES_IN) {
  console.warn(
    "[env] JWT_EXPIRES_IN is set but no longer used — sessions are now " +
      `an access token (${accessTokenTtl}) plus a refresh token ` +
      `(${refreshTokenTtl}). Set ACCESS_TOKEN_TTL / REFRESH_TOKEN_TTL ` +
      "instead, and remove JWT_EXPIRES_IN.",
  );
}

// ============================================================
// CLOUDFLARE R2
// ============================================================
//
// Required, like the database: every admin screen that takes a picture
// writes it here, and the storefront loads it back from R2_PUBLIC_URL —
// the custom domain connected to the bucket, which is Cloudflare's CDN.
//
// The public URL is stored inside every image row, so its exact form
// matters: one canonical https origin with no trailing slash, or the
// rows written today and the ones written next month disagree.

let r2PublicUrl;

try {
  r2PublicUrl = new URL(process.env.R2_PUBLIC_URL);
} catch {
  throw new Error(
    `R2_PUBLIC_URL is not a valid URL: "${process.env.R2_PUBLIC_URL}". ` +
      "Expected the bucket's custom domain, e.g. https://images.salwarbutterfly.in",
  );
}

if (r2PublicUrl.protocol !== "https:" && nodeEnv === "production") {
  throw new Error("R2_PUBLIC_URL must use https in production");
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
// SENTRY
// ============================================================
//
// Optional, for the same reason Razorpay is: the API has to run on a
// laptop, in CI and in a migration script without anybody holding a
// Sentry account. No DSN means src/instrument.js never calls init, and
// every Sentry call in the codebase becomes a no-op — the SDK is
// written to tolerate that, so nothing needs an `if` around it.
//
// What is lost without a DSN is only the reporting. winston still
// writes every error to logs/error-*.log, which is where these errors
// were read before Sentry existed and still are locally.
//
// The environment is named separately from NODE_ENV because Sentry's
// notion of one is coarser than Node's: staging and production are both
// NODE_ENV=production to Express, and telling their errors apart on the
// dashboard means saying so here.

const sentryDsn = process.env.SENTRY_DSN ?? null;
const sentryEnabled = Boolean(sentryDsn);

const sentryEnvironment = process.env.SENTRY_ENVIRONMENT ?? nodeEnv;

// Whatever identifies the running build — a commit sha, a tag. Sentry
// uses it to group regressions and to find the right source maps; null
// is honest about not knowing rather than lumping every deploy together
// under one made-up version.
const sentryRelease = process.env.SENTRY_RELEASE ?? null;

// Performance tracing is billed per transaction and off unless asked
// for. 0 keeps error reporting and sends no traces at all.
const sentryTracesSampleRate = Number(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0,
);

if (
  !Number.isFinite(sentryTracesSampleRate) ||
  sentryTracesSampleRate < 0 ||
  sentryTracesSampleRate > 1
) {
  throw new Error("SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1");
}

// console, not the logger — same cycle as the Razorpay warnings above.
if (!sentryEnabled && nodeEnv === "production") {
  console.warn(
    "[env] SENTRY_DSN not set — server errors will only reach " +
      "logs/error-*.log, not Sentry",
  );
}

// ============================================================
// REDIS
// ============================================================
//
// Optional, for the same reason Razorpay and Sentry are: the API has to
// run on a laptop and in CI without anybody provisioning a Redis. With
// no URL the rate limiters fall back to express-rate-limit's in-memory
// store — see rateLimiter.js — which is correct for a single process
// and wrong for anything else.
//
// That is why production warns. Counters in process memory reset on
// every deploy and are counted separately by every instance, so a limit
// of 10 quietly becomes 10-per-restart-per-container. The limiters keep
// working either way, which is exactly what makes the difference
// invisible without this line.
//
// Aiven issues the URI with a rediss:// scheme (double s = TLS); the
// plain redis:// form is what a local docker container gives you.

// `||`, not `??`: .env.example ships the key present and empty, which is
// the ordinary way to say "off" and would otherwise read as a URL of "".
const redisUrl = process.env.REDIS_URL || null;
const redisEnabled = Boolean(redisUrl);

// console, not the logger — same cycle as the warnings above.
if (!redisEnabled && nodeEnv === "production") {
  console.warn(
    "[env] REDIS_URL not set — rate limit counters are kept in process " +
      "memory: they reset on every restart and are not shared between " +
      "instances, so the configured limits are not the effective ones",
  );
}

// ============================================================
// EMAIL (RESEND)
// ============================================================
//
// Order emails and password reset.
//
// Optional in the same way Razorpay is. With no API key every order
// email is recorded as `skipped` and nothing else changes — except that
// "forgot password" cannot work, which the reset endpoint says plainly.
//
//   RESEND_API_KEY      sends. Resend dashboard -> API Keys.
//   EMAIL_FROM          the sender. Until a domain is verified on Resend
//                       this must be onboarding@resend.dev, and Resend
//                       will then only deliver to the address that owns
//                       the Resend account — see EMAIL_TEST_RECIPIENT.
//   ADMIN_NOTIFY_EMAIL  where "new order" alerts go. Comma-separated for
//                       more than one.
//   STOREFRONT_URL      the shop's public origin, for the links inside
//                       the emails (reset link, order page).

// `||`, not `??`, matching REDIS_URL: .env.example ships these
// present and empty.
const resendApiKey = process.env.RESEND_API_KEY || null;

const emailFrom =
  process.env.EMAIL_FROM || "Salwar Butterfly <onboarding@resend.dev>";

const emailReplyTo = process.env.EMAIL_REPLY_TO || null;

const adminNotifyEmails = (process.env.ADMIN_NOTIFY_EMAIL || "")
  .split(",")
  .map((address) => address.trim().toLowerCase())
  .filter(Boolean);

const emailEnabled = Boolean(resendApiKey);

let storefrontUrl;

try {
  storefrontUrl = new URL(process.env.STOREFRONT_URL || corsOrigin).origin;
} catch {
  throw new Error(
    `STOREFRONT_URL is not a valid URL: "${process.env.STOREFRONT_URL}". ` +
      "Expected the shop's public address, e.g. https://salwarbutterfly.in",
  );
}

// The logo at the top of every email. It has to be a public https URL —
// Gmail and Outlook block embedded (data:) images — so it lives in the
// R2 bucket beside the product photos. EMAIL_LOGO_URL overrides it;
// unset, the copy uploaded to email/salwar-butterfly-logo.jpg is used.
const emailLogoUrl =
  process.env.EMAIL_LOGO_URL || `${r2PublicUrl.origin}/email/salwar-butterfly-logo.jpg`;

// ---- TEST MODE ------------------------------------------------
//
// Every outbound email, customer and admin alike, goes to this one
// address instead.
//
// Needed in practice while Resend has no verified domain, because Resend
// refuses to send to anyone but the account owner until one is — and a
// test order carries whatever email was typed into the checkout.
const emailTestRecipient =
  (process.env.EMAIL_TEST_RECIPIENT || "").trim().toLowerCase() || null;

if (emailTestRecipient && nodeEnv === "production") {
  throw new Error(
    "EMAIL_TEST_RECIPIENT must not be set in production — it would " +
      "redirect every customer and admin email to one address.",
  );
}

// console, not the logger — same cycle as the warnings above.
if (emailTestRecipient) {
  console.warn(
    `[env] Email TEST MODE — every email is redirected to ${emailTestRecipient}`,
  );
}

if (emailEnabled && adminNotifyEmails.length === 0) {
  console.warn(
    "[env] ADMIN_NOTIFY_EMAIL not set — the shop will not be emailed about new orders",
  );
}

if (!emailEnabled && nodeEnv === "production") {
  console.warn(
    "[env] RESEND_API_KEY not set — order emails are off and password reset cannot work",
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

  checkoutHoldMinutes,
  unpaidOrderSweepEnabled:
    process.env.UNPAID_ORDER_SWEEP === "on" ||
    (nodeEnv === "production" && process.env.UNPAID_ORDER_SWEEP !== "off"),

  // The payment reconciler (queues/payment.reconciler.js). Same rule as
  // the sweeper above: it writes to orders, so it runs in production and
  // nowhere else unless asked — every dev machine shares one database.
  paymentReconcileEnabled:
    process.env.PAYMENT_RECONCILE === "on" ||
    (nodeEnv === "production" && process.env.PAYMENT_RECONCILE !== "off"),

  // ==========================================================
  // DATABASE
  // ==========================================================

  databaseUrl: process.env.DATABASE_URL,

  pgCaCert,

  // ==========================================================
  // CORS
  // ==========================================================

  corsOrigin,

  // ==========================================================
  // JWT
  // ==========================================================

  jwtSecret,
  accessTokenTtl,
  refreshTokenTtl,

  // ==========================================================
  // CLOUDFLARE R2
  // ==========================================================

  r2: Object.freeze({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicUrl: r2PublicUrl.origin,
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

  // ==========================================================
  // SENTRY
  // ==========================================================

  sentry: Object.freeze({
    enabled: sentryEnabled,
    dsn: sentryDsn,
    environment: sentryEnvironment,
    release: sentryRelease,
    tracesSampleRate: sentryTracesSampleRate,
  }),

  // ==========================================================
  // REDIS
  // ==========================================================

  redis: Object.freeze({
    enabled: redisEnabled,
    url: redisUrl,
  }),

  // ==========================================================
  // EMAIL
  // ==========================================================

  email: Object.freeze({
    enabled: emailEnabled,
    resendApiKey,
    from: emailFrom,
    replyTo: emailReplyTo,
    adminRecipients: Object.freeze(adminNotifyEmails),
    storefrontUrl,
    logoUrl: emailLogoUrl,

    // null in every ordinary deployment — see the TEST MODE note above.
    testRecipient: emailTestRecipient,
  }),
});
