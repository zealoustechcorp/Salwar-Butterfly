// tests/admin.passwordReset.test.js
//
// Admin "forgot password": AdminPasswordResetService, and requireAdmin
// refusing access tokens issued before a reset.
//
// Every repository and the email sender are stand-ins (mock.method), so
// nothing here touches Postgres, Redis or Resend.
//
// Run with: npm test

import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";
// Email on, so requestReset does not refuse with EMAIL_NOT_CONFIGURED.
process.env.RESEND_API_KEY = "re_test_key";
process.env.ADMIN_NOTIFY_EMAIL = "owner@example.test";
process.env.STOREFRONT_URL = "https://shop.example.test/";
process.env.EMAIL_TEST_RECIPIENT = "";

const { AdminPasswordResetService } = await import(
  "../src/services/admin_password_reset.service.js"
);
const { AdminPasswordResetRepository } = await import(
  "../src/repository/admin_password_reset.repository.js"
);
const { AdminRepository } = await import("../src/repository/admin.repository.js");
const { RefreshTokenRepository } = await import("../src/repository/refresh_token.repository.js");
const { EmailService } = await import("../src/services/email.service.js");
const { ADMIN_TOKEN_TYPE } = await import("../src/services/admin.auth.service.js");
const { requireAdmin } = await import("../src/middlewares/authorize.middleware.js");
const { hashToken, REVOKE_REASON } = await import("../src/config/auth.policy.js");

const ADMIN = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test Admin",
  email: "admin@example.com",
  role: "admin",
  active: true,
};

afterEach(() => mock.restoreAll());

/** requestReset sends detached; give the background work a moment. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// ============================================================
// REQUEST
// ============================================================

describe("AdminPasswordResetService.requestReset", () => {
  it("emails an admin a 15-minute link to the admin reset page, storing only its hash", async () => {
    mock.method(AdminRepository, "findByEmailForAuth", async () => ({ ...ADMIN, password: "x" }));
    const create = mock.method(AdminPasswordResetRepository, "create", async () => true);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await AdminPasswordResetService.requestReset(ADMIN.email, { ip: "203.0.113.5" });
    await settle();

    assert.equal(send.mock.callCount(), 1);
    const { to, text } = send.mock.calls[0].arguments[0];
    assert.equal(to, ADMIN.email);

    const url = text.match(/https:\/\/\S+/)[0];
    assert.ok(url.startsWith("https://shop.example.test/admin/reset-password?token="));

    const token = decodeURIComponent(new URL(url).searchParams.get("token"));
    const stored = create.mock.calls[0].arguments[0];
    assert.equal(stored.tokenHash, hashToken(token));
    assert.notEqual(stored.tokenHash, token);
    assert.equal(stored.ttlMinutes, 15);
    assert.equal(stored.adminId, ADMIN.id);
  });

  it("sends nothing for an unknown address", async () => {
    mock.method(AdminRepository, "findByEmailForAuth", async () => null);
    const create = mock.method(AdminPasswordResetRepository, "create", async () => true);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await AdminPasswordResetService.requestReset("nobody@example.com");
    await settle();

    assert.equal(create.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });

  it("sends nothing to a disabled admin", async () => {
    mock.method(AdminRepository, "findByEmailForAuth", async () => ({ ...ADMIN, active: false }));
    const create = mock.method(AdminPasswordResetRepository, "create", async () => true);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await AdminPasswordResetService.requestReset(ADMIN.email);
    await settle();

    assert.equal(create.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });

  it("sends nothing inside the cooldown", async () => {
    mock.method(AdminRepository, "findByEmailForAuth", async () => ({ ...ADMIN, password: "x" }));
    mock.method(AdminPasswordResetRepository, "create", async () => false);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await AdminPasswordResetService.requestReset(ADMIN.email);
    await settle();

    assert.equal(send.mock.callCount(), 0);
  });

  it("resolves the same way when the lookup fails, so failures leak nothing", async () => {
    mock.method(AdminRepository, "findByEmailForAuth", async () => {
      throw new Error("database down");
    });

    await AdminPasswordResetService.requestReset(ADMIN.email);
    await settle();
  });
});

// ============================================================
// RESET
// ============================================================

describe("AdminPasswordResetService.resetPassword", () => {
  it("sets the password, ends every admin session and tells the owner", async () => {
    const consume = mock.method(AdminPasswordResetRepository, "consume", async () => ADMIN);
    const revoke = mock.method(RefreshTokenRepository, "revokeAllForSubject", async () => 2);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await AdminPasswordResetService.resetPassword("a".repeat(43), "NewPassword1", {
      ip: "203.0.113.5",
    });
    await settle();

    const [tokenHash, hashedPassword] = consume.mock.calls[0].arguments;
    assert.equal(tokenHash, hashToken("a".repeat(43)));
    assert.match(hashedPassword, /^\$2[aby]\$12\$/);

    assert.deepEqual(revoke.mock.calls[0].arguments, [
      ADMIN.id,
      ADMIN_TOKEN_TYPE,
      REVOKE_REASON.PASSWORD_RESET,
    ]);

    assert.equal(send.mock.callCount(), 1);
    assert.equal(send.mock.calls[0].arguments[0].to, ADMIN.email);
    assert.match(send.mock.calls[0].arguments[0].subject, /password was changed/);
  });

  it("refuses a used, expired or unknown token", async () => {
    mock.method(AdminPasswordResetRepository, "consume", async () => null);
    const revoke = mock.method(RefreshTokenRepository, "revokeAllForSubject", async () => 0);
    const send = mock.method(EmailService, "sendNow", async () => ({}));

    await assert.rejects(
      AdminPasswordResetService.resetPassword("b".repeat(43), "NewPassword1"),
      (error) => error.code === "RESET_TOKEN_INVALID" && error.statusCode === 400,
    );

    assert.equal(revoke.mock.callCount(), 0);
    assert.equal(send.mock.callCount(), 0);
  });
});

// ============================================================
// requireAdmin
// ============================================================

describe("requireAdmin after a password reset", () => {
  const run = async (user) => {
    let passed = false;
    await requireAdmin({ user: { typ: ADMIN_TOKEN_TYPE, role: ADMIN.role, ...user }, method: "GET", originalUrl: "/x" }, {}, () => {
      passed = true;
    });
    return passed;
  };

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  it("refuses an access token issued before the reset", async () => {
    mock.method(AdminRepository, "findById", async () => ({
      ...ADMIN,
      password_changed_at: new Date(),
    }));

    await assert.rejects(
      run({ id: ADMIN.id, iat: nowSeconds() - 60 }),
      (error) => error.code === "SESSION_INVALID",
    );
  });

  it("accepts a token issued after the reset, allowing for clock skew", async () => {
    // The database clock runs ahead; a token signed a moment "before" it
    // by the API host's clock is still the admin's fresh sign-in.
    mock.method(AdminRepository, "findById", async () => ({
      ...ADMIN,
      password_changed_at: new Date(Date.now() + 2_000),
    }));

    assert.equal(await run({ id: ADMIN.id, iat: nowSeconds() }), true);
  });

  it("accepts any token on an account that was never reset", async () => {
    const findById = mock.method(AdminRepository, "findById", async () => ({
      ...ADMIN,
      password_changed_at: null,
    }));

    assert.equal(await run({ id: ADMIN.id, iat: nowSeconds() - 600 }), true);
    assert.deepEqual(findById.mock.calls[0].arguments[1], { withPasswordChangedAt: true });
  });
});
