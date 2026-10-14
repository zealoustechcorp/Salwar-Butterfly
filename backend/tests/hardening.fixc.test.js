// tests/hardening.fixc.test.js
//
// Small guards from the October hardening pass, each of which used to
// turn a caller's mistake into a 500, a misleading message or a leaked
// secret:
//
//   - webhooks with an empty body answered 500 instead of 400
//   - report dates outside Postgres's range (0000-01-01) answered 500
//   - an unknown order-report sort was silently accepted
//   - WhatsApp's verify token was written to the request log
//   - a ninth banner was refused as an "unexpected file field"
//   - deleted story photos stayed on the CDN edge for a year
//
// None of these need a database: every refusal happens before the first
// query, which is the property being tested.
//
// Run with: npm test

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import multer from "multer";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";
process.env.RAZORPAY_KEY_ID ??= "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET ??= "rzp_test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "rzp_test_webhook_secret";

const { redactUrl } = await import("../src/utils/redactUrl.js");
const { PaymentService } = await import("../src/services/payment.service.js");
const { ReportService } = await import("../src/services/report.service.js");
const { validateOrderReportQuery, validateSalesReportQuery } = await import(
  "../src/validators/report.validator.js"
);
const { handleBannerUploadError, handleUploadError } = await import(
  "../src/middlewares/upload.middleware.js"
);
const { MAX_BANNERS_PER_UPLOAD } = await import("../src/config/banner.policy.js");
const { cacheControlFor } = await import("../src/config/r2.storage.js");

/** Runs a validator middleware and returns what it passed to next(). */
const runValidator = (validator, query) => {
  let passed;
  validator({ query }, {}, (error) => {
    passed = error;
  });
  return passed;
};

const statusOf = (error) => error?.statusCode ?? error?.status;

// ============================================================

describe("redactUrl", () => {
  it("hides WhatsApp's verify token and keeps the rest", () => {
    const out = redactUrl(
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=s3cret&hub.challenge=123",
    );

    assert.equal(
      out,
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=[REDACTED]&hub.challenge=123",
    );
  });

  it("catches other credential-shaped names", () => {
    const out = redactUrl("/x?token=a&client_secret=b&apiKey=c&page=2");

    assert.ok(!/=a(&|$)|=b(&|$)|=c(&|$)/.test(out), out);
    assert.match(out, /page=2/);
  });

  it("leaves a URL without a query string alone", () => {
    assert.equal(redactUrl("/api/orders/123"), "/api/orders/123");
  });

  it("does not redact look-alikes", () => {
    assert.equal(redactUrl("/x?author=a&footprint=b"), "/x?author=a&footprint=b");
  });
});

describe("webhook bodies", () => {
  it("refuses an empty Razorpay delivery as a 400, not a 500", () => {
    assert.throws(
      () => PaymentService.verifyWebhook({ rawBody: Buffer.alloc(0), signature: "x" }),
      (error) => statusOf(error) === 400,
    );
  });

  it("refuses a missing Razorpay body as a 400", () => {
    assert.throws(
      () => PaymentService.verifyWebhook({ rawBody: null, signature: "x" }),
      (error) => statusOf(error) === 400,
    );
  });
});

describe("report ranges", () => {
  it("validator refuses year 0000", () => {
    const error = runValidator(validateSalesReportQuery, { from: "0000-01-01" });

    assert.equal(statusOf(error), 400);
    assert.ok(error.errors?.from);
  });

  it("service refuses year 0000 before reaching Postgres", async () => {
    await assert.rejects(
      ReportService.getSalesReport({ from: "0000-01-01" }),
      (error) => statusOf(error) === 400,
    );

    await assert.rejects(
      ReportService.getOrderReport({ to: "9999-12-31" }),
      (error) => statusOf(error) === 400,
    );
  });

  it("accepts an ordinary date", () => {
    const error = runValidator(validateSalesReportQuery, {
      from: "2026-01-01",
      to: "2026-02-01",
    });

    assert.equal(error, undefined);
  });
});

describe("order report sort", () => {
  it("validator refuses an unknown sort", () => {
    const error = runValidator(validateOrderReportQuery, { sort: "bogus" });

    assert.equal(statusOf(error), 400);
    assert.ok(error.errors?.sort);
  });

  it("service refuses an unknown sort", async () => {
    await assert.rejects(
      ReportService.getOrderReport({ sort: "bogus" }),
      (error) => statusOf(error) === 400,
    );
  });

  it("validator accepts a known sort", () => {
    assert.equal(runValidator(validateOrderReportQuery, { sort: "oldest" }), undefined);
  });
});

describe("upload count message", () => {
  const run = (handler, error) => {
    let passed;
    handler(error, {}, {}, (e) => {
      passed = e;
    });
    return passed;
  };

  it("one banner too many says how many are allowed", () => {
    const error = run(
      handleBannerUploadError,
      new multer.MulterError("LIMIT_UNEXPECTED_FILE", "images"),
    );

    assert.equal(statusOf(error), 400);
    assert.match(error.message, new RegExp(`At most ${MAX_BANNERS_PER_UPLOAD}`));
  });

  it("a wrong field name is still called a wrong field name", () => {
    const error = run(
      handleBannerUploadError,
      new multer.MulterError("LIMIT_UNEXPECTED_FILE", "photos"),
    );

    assert.match(error.message, /Unexpected file field "photos"/);
  });

  it("single-image routes keep their message", () => {
    const error = run(handleUploadError, new multer.MulterError("LIMIT_UNEXPECTED_FILE", "img"));

    assert.match(error.message, /Unexpected file field/);
  });
});

describe("R2 cache lifetime", () => {
  it("keeps product images immutable", () => {
    assert.match(cacheControlFor("products/abc.webp"), /immutable/);
  });

  it("keeps removable content short-lived", () => {
    for (const key of ["stories/a.jpg", "banners/a.jpg", "categories/a.jpg", "x/a.jpg"]) {
      const value = cacheControlFor(key);
      assert.doesNotMatch(value, /immutable/, key);
      assert.ok(Number(/max-age=(\d+)/.exec(value)[1]) <= 300, key);
    }
  });
});
