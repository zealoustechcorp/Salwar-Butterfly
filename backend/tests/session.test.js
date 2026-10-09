// tests/session.test.js
//
// Rotation, reuse detection and revocation in SessionService.
//
// Unlike the other suites in this directory, this one talks to a real
// database, and that is deliberate rather than lazy. The behaviour under
// test is not "does the service call the right method" — it is whether a
// revocation survives the refusal that follows it. The first version of
// this code revoked the family and then threw from inside the same
// transaction, so `withTransaction` rolled the revocation back: the
// reuse alarm fired, the Sentry event went out, and the stolen session
// carried on working. A stand-in repository would have recorded the
// revoke call and reported a pass.
//
// So: a live Postgres, real transactions, and the rows checked
// afterwards. Without a reachable DATABASE_URL the suite skips rather
// than fails, so `npm test` still runs on a laptop with no network.
//
// Rows are written under a synthetic subject id and deleted at the end;
// nothing here touches an account that exists.
//
// Run with: npm test

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// env.js validates at import time, so the variables have to exist
// before the dynamic imports below. `??=` leaves the real values alone
// when `npm test` loaded a .env — which is what decides whether this
// suite runs against a database or skips itself.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";

const { SessionService } = await import("../src/services/session.service.js");
const { query, closeDb } = await import("../src/config/db.js");
const { verifyToken } = await import("../src/utils/jwt.js");
const { TOKEN_USE, REVOKE_REASON, REFRESH_REUSE_GRACE_MS } = await import(
  "../src/config/auth.policy.js"
);

// ============================================================
// FIXTURES
// ============================================================

const SUBJECT = randomUUID();
const TYP = "admin";
const CLAIMS = { email: "session-test@example.com", role: "super_admin" };

/** The account is still allowed in. */
const activeAccount = async () => CLAIMS;

/** The account has been deactivated or deleted. */
const goneAccount = async () => null;

const open = () =>
  SessionService.open({ subjectId: SUBJECT, typ: TYP, claims: CLAIMS });

const renew = (token, loadSubject = activeAccount) =>
  SessionService.renew({ token, typ: TYP, loadSubject });

/** Every row written for this test's subject, oldest first. */
const familyRows = async (familyId) => {
  const { rows } = await query(
    `SELECT used_at, revoked_at, revoked_reason
     FROM refresh_tokens
     WHERE family_id = $1::uuid
     ORDER BY created_at`,
    [familyId],
  );

  return rows;
};

/**
 * Age a family's burns past the grace window.
 *
 * The alternative is sleeping for ten seconds in a test suite, which
 * nobody would then run. What is being tested is the branch, not the
 * clock.
 */
const ageBurns = (familyId) =>
  query(
    `UPDATE refresh_tokens
     SET used_at = NOW() - ($2 || ' milliseconds')::interval
     WHERE family_id = $1::uuid AND used_at IS NOT NULL`,
    [familyId, REFRESH_REUSE_GRACE_MS * 6],
  );

/** The code on a rejection, or null if the call unexpectedly succeeded. */
const refusalCode = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.code;
  }
};

// ============================================================
// SUITE
// ============================================================

/**
 * Whether there is a database to test against.
 *
 * Probed here at module load rather than in a `before` hook, because
 * `describe` reads its own options the moment it is registered — which
 * happens before any hook runs. A flag set in `before` is still false at
 * the only instant the skip is consulted, and the whole suite silently
 * skips even against a healthy database.
 */
const unreachable = await query("SELECT 1").then(
  () => false,
  () => "no reachable DATABASE_URL — session tests need one",
);

after(async () => {
  if (!unreachable) {
    await query(`DELETE FROM refresh_tokens WHERE subject_id = $1::uuid`, [
      SUBJECT,
    ]);
  }

  await closeDb();
});

describe("SessionService", { skip: unreachable }, () => {
  // ==========================================================
  // OPENING
  // ==========================================================

  describe("open", () => {
    it("issues one access token and one refresh token", async () => {
      const session = await open();

      assert.equal(verifyToken(session.accessToken).tok, TOKEN_USE.ACCESS);
      assert.equal(verifyToken(session.refreshToken).tok, TOKEN_USE.REFRESH);
    });

    it("records exactly one live row for the new family", async () => {
      const session = await open();
      const rows = await familyRows(session.familyId);

      assert.equal(rows.length, 1);
      assert.equal(rows[0].used_at, null);
      assert.equal(rows[0].revoked_at, null);
    });

    it("gives two logins by the same account separate families", async () => {
      const first = await open();
      const second = await open();

      assert.notEqual(first.familyId, second.familyId);
    });
  });

  // ==========================================================
  // ROTATION
  // ==========================================================

  describe("rotation", () => {
    it("burns the presented token and issues a new one", async () => {
      const first = await open();
      const second = await renew(first.refreshToken);

      assert.notEqual(second.refreshToken, first.refreshToken);

      const rows = await familyRows(first.familyId);

      assert.equal(rows.length, 2);
      assert.notEqual(rows[0].used_at, null, "the old token should be burned");
      assert.equal(rows[1].used_at, null, "the new token should be unused");
    });

    it("keeps the rotation inside the family it started in", async () => {
      const first = await open();
      const second = await renew(first.refreshToken);

      assert.equal(second.familyId, first.familyId);
    });

    it("mints the access token from the account, not from the old token", async () => {
      const first = await open();

      // The shop demoted this admin between the login and the refresh.
      const second = await renew(first.refreshToken, async () => ({
        email: CLAIMS.email,
        role: "admin",
      }));

      assert.equal(verifyToken(second.accessToken).role, "admin");
    });

    it("tolerates a second tab refreshing inside the grace window", async () => {
      const first = await open();

      await renew(first.refreshToken);
      const racing = await renew(first.refreshToken);

      assert.ok(racing.accessToken, "the racing tab should get a session");

      const rows = await familyRows(first.familyId);

      assert.ok(
        rows.every((row) => row.revoked_at === null),
        "a concurrent refresh must not be treated as theft",
      );
    });
  });

  // ==========================================================
  // REUSE DETECTION
  // ==========================================================

  describe("reuse detection", () => {
    it("refuses a token replayed after the grace window", async () => {
      const first = await open();
      await renew(first.refreshToken);
      await ageBurns(first.familyId);

      assert.equal(
        await refusalCode(renew(first.refreshToken)),
        "REFRESH_REUSED",
      );
    });

    it("revokes the whole family, durably", async () => {
      const first = await open();
      await renew(first.refreshToken);
      await ageBurns(first.familyId);

      await refusalCode(renew(first.refreshToken));

      // The assertion the first version of this code failed: the
      // revocation has to outlive the rejection that followed it.
      const rows = await familyRows(first.familyId);

      assert.ok(
        rows.every((row) => row.revoked_at !== null),
        "every row in the family should be revoked",
      );

      assert.ok(
        rows.every(
          (row) => row.revoked_reason === REVOKE_REASON.REUSE_DETECTED,
        ),
      );
    });

    it("kills the rotations the thief already performed", async () => {
      const first = await open();

      // The attacker gets there first and rotates.
      const stolen = await renew(first.refreshToken);

      await ageBurns(first.familyId);

      // The real owner then presents the token they still hold, which
      // is what exposes the theft.
      await refusalCode(renew(first.refreshToken));

      // The attacker's newer token has to be dead too — revoking only
      // the replayed one would leave them holding a live session.
      assert.equal(
        await refusalCode(renew(stolen.refreshToken)),
        "REFRESH_REUSED",
      );
    });
  });

  // ==========================================================
  // WHAT A REFRESH TOKEN IS NOT
  // ==========================================================

  describe("token confusion", () => {
    it("refuses an access token at the refresh endpoint", async () => {
      const session = await open();

      assert.equal(
        await refusalCode(renew(session.accessToken)),
        "REFRESH_INVALID",
      );
    });

    it("refuses a refresh token belonging to the other audience", async () => {
      const session = await open();

      assert.equal(
        await refusalCode(
          SessionService.renew({
            token: session.refreshToken,
            typ: "customer",
            loadSubject: activeAccount,
          }),
        ),
        "REFRESH_INVALID",
      );
    });

    it("refuses a token it never signed", async () => {
      assert.equal(await refusalCode(renew("not-a-jwt")), "REFRESH_INVALID");
    });

    it("refuses an absent token", async () => {
      assert.equal(await refusalCode(renew(null)), "REFRESH_MISSING");
    });
  });

  // ==========================================================
  // THE ACCOUNT BEHIND THE SESSION
  // ==========================================================

  describe("account state", () => {
    it("refuses to renew for an account that may no longer sign in", async () => {
      const session = await open();

      assert.equal(
        await refusalCode(renew(session.refreshToken, goneAccount)),
        "SESSION_INVALID",
      );
    });

    it("revokes that account's family, durably", async () => {
      const session = await open();

      await refusalCode(renew(session.refreshToken, goneAccount));

      const rows = await familyRows(session.familyId);

      assert.ok(rows.every((row) => row.revoked_at !== null));
    });
  });

  // ==========================================================
  // CLOSING
  // ==========================================================

  describe("close", () => {
    it("revokes the family behind the token", async () => {
      const session = await open();

      assert.equal(
        await SessionService.close({ token: session.refreshToken, typ: TYP }),
        true,
      );

      const rows = await familyRows(session.familyId);

      assert.ok(rows.every((row) => row.revoked_at !== null));
      assert.ok(
        rows.every((row) => row.revoked_reason === REVOKE_REASON.LOGOUT),
      );
    });

    it("ends the session — the token cannot renew afterwards", async () => {
      const session = await open();

      await SessionService.close({ token: session.refreshToken, typ: TYP });

      assert.equal(
        await refusalCode(renew(session.refreshToken)),
        "REFRESH_REVOKED",
      );
    });

    it("ends every rotation, not just the current one", async () => {
      const first = await open();
      const second = await renew(first.refreshToken);

      await SessionService.close({ token: second.refreshToken, typ: TYP });

      assert.equal(
        await refusalCode(renew(second.refreshToken)),
        "REFRESH_REVOKED",
      );
    });

    // Logging out must never fail. Somebody told to try again believes
    // they are still signed in, which is the opposite of what they asked
    // for — and the cookie is cleared regardless of what this returns.
    it("is forgiving of a token it cannot read", async () => {
      assert.equal(
        await SessionService.close({ token: "not-a-jwt", typ: TYP }),
        false,
      );
    });

    it("is forgiving of no token at all", async () => {
      assert.equal(await SessionService.close({ token: null, typ: TYP }), false);
    });
  });
});
