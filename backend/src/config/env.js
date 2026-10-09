/**
 * Centralised, validated environment configuration.
 *
 * Values are loaded by:
 * node --env-file=.env
 *
 * See package.json scripts.
 */

// The only import in this file, and it earns its place:
// WHATSAPP_TEST_RECIPIENT below is a phone number, and a phone number
// that has not been through toE164 is exactly the kind of value that
// fails silently at the far end. utils/phone.js imports nothing, so
// this cannot become a cycle.
import { maskPhone, toE164 } from "../utils/phone.js";

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
// Without a CA certificate the Postgres connection is encrypted but not
// authenticated: db.js falls back to rejectUnauthorized: false, which accepts
// any certificate the other end presents. Anyone able to redirect the traffic
// can then terminate the TLS and read the password out of the startup packet.
//
// That is a tolerable trade on a laptop and not in production, so it is the
// same shape as the CORS rule below — refuse to boot rather than go live
// silently unsafe. Development and test warn and continue (see db.js) so the
// API, the migrations and the tests still run without the cert on hand.

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

if (nodeEnv === "production" && !pgCaCert) {
  throw new Error(
    "PG_CA_CERT must be configured in production — the Postgres TLS " +
      "certificate would otherwise go unverified. Download the CA from the " +
      "Aiven console (the PostgreSQL service → Overview → CA Certificate).",
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
// WHATSAPP (META CLOUD API)
// ============================================================
//
// Order notifications: the shop is told when money lands, the shopper is
// told what happened to the parcel.
//
// Optional in exactly the way Razorpay is. With no token and no phone
// number id the feature turns itself off and every other path — placing
// an order, taking payment, moving it through the queue — behaves as it
// did before. A shop that has not finished Meta's business verification
// is a shop that runs fine and sends nothing.
//
// Four separate credentials, which is easy to confuse and expensive to
// confuse, so they are named apart here rather than in the caller:
//
//   ACCESS_TOKEN   sends messages. A System User token from Business
//                  Settings, which never expires. The one the Graph API
//                  explorer hands you looks identical and dies in 24
//                  hours, taking every message with it — see the note
//                  on error 190 in whatsapp.gateway.js.
//   PHONE_NUMBER_ID  which of the business's numbers to send *from*.
//                  A numeric id, not a phone number.
//   APP_SECRET     verifies Meta's inbound delivery receipts. Not the
//                  access token, though both are secrets on the same
//                  app.
//   VERIFY_TOKEN   a string we invent, echoed back once during the
//                  webhook handshake. It proves nothing after that.
//
// Only the first two are needed to send. The last two are the inbound
// half, which is why their absence is a quieter warning.

// `||`, not `??`, for every one: .env.example ships these present and
// empty, the same convention REDIS_URL uses above.
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || null;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
const whatsappBusinessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET || null;
const whatsappVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null;

// Pinned rather than defaulted to "latest", because Meta's versions
// expire on a published schedule and a silent bump is a template
// payload that stops being accepted on a date nobody wrote down.
const whatsappApiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

const whatsappEnabled = Boolean(whatsappAccessToken && whatsappPhoneNumberId);

// ---- TEST MODE ------------------------------------------------
//
// One number that every outbound message is redirected to, whoever it
// was addressed to.
//
// Meta's own test sending number may only message handsets registered
// as recipients on the app, so an order placed with any other phone
// fails at the gateway anyway. More to the point: a test order carries
// a real number typed into a real checkout box, and the admin
// recipients are real staff phones. Neither should receive "your order
// has shipped" because somebody was exercising the queue.
//
// Enforced in whatsapp.gateway.js — the single point a message leaves
// this process — rather than while planning the send. The outbox row
// therefore keeps the number the message was *for*, which is the
// honest record of what the system decided, and there is no path
// around the override.
const whatsappTestRecipientRaw = process.env.WHATSAPP_TEST_RECIPIENT || null;

const whatsappTestRecipient = whatsappTestRecipientRaw
  ? toE164(whatsappTestRecipientRaw)
  : null;

// Refuse to boot rather than fall back to "no redirect". A value that
// was meant to be a safety net and quietly is not one is worse than
// not having set it: the whole reason it exists is that the person
// running the test believes nothing can escape.
if (whatsappTestRecipientRaw && !whatsappTestRecipient) {
  throw new Error(
    `WHATSAPP_TEST_RECIPIENT is not a number that can be routed: ` +
      `"${whatsappTestRecipientRaw}". Expected something toE164 accepts, ` +
      `e.g. 6374406703 or +916374406703.`,
  );
}

// The same refusal as CORS_ORIGIN and PG_CA_CERT above, for the
// same reason. A redirect left in a production .env sends every
// customer's order updates to one handset and tells nobody it did.
if (whatsappTestRecipient && nodeEnv === "production") {
  throw new Error(
    "WHATSAPP_TEST_RECIPIENT must not be set in production — it would " +
      "redirect every customer and admin notification to one number.",
  );
}

if (whatsappTestRecipient) {
  console.warn(
    `[env] WhatsApp TEST MODE — every message is redirected to ` +
      `${maskPhone(whatsappTestRecipient)}, whoever it was addressed to`,
  );
}

// console, not the logger — same cycle as the warnings above.
//
// Not configured at all is an ordinary deployment, not a problem, so it
// says nothing. Half-configured is worth one line: messages send, but
// every one of them stays at `sent` forever because a delivery receipt
// that cannot be verified is not accepted.
if (whatsappEnabled && !(whatsappAppSecret && whatsappVerifyToken)) {
  console.warn("[env] WhatsApp receipts disabled (APP_SECRET/VERIFY_TOKEN missing)");
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
  // WHATSAPP
  // ==========================================================

  whatsapp: Object.freeze({
    enabled: whatsappEnabled,
    accessToken: whatsappAccessToken,
    phoneNumberId: whatsappPhoneNumberId,
    businessAccountId: whatsappBusinessAccountId,
    appSecret: whatsappAppSecret,
    verifyToken: whatsappVerifyToken,
    apiVersion: whatsappApiVersion,

    // Whether an inbound delivery receipt can be trusted, and so
    // whether the webhook route should be mounted at all.
    receiptsEnabled: Boolean(whatsappAppSecret && whatsappVerifyToken),

    // null in every ordinary deployment. Non-null means every send is
    // redirected here — see the TEST MODE note above.
    testRecipient: whatsappTestRecipient,
  }),
});
