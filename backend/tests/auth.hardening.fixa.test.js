// tests/auth.hardening.fixa.test.js
//
// The session, account and saved-data fixes from the 2026-10-09 stress
// test (HIGH-1, MED-2, BUG-4..8, the clock-skew and unique-name rules).
//
// No database. Every repository is replaced with a stand-in, and where a
// fix lives in *which connection* a query runs on (HIGH-1) the pool
// itself is stubbed, so the test can see that renewal never asks it for
// a second connection. What these cannot show is Postgres honouring a
// row lock — that needs a live database and is covered by the E2E run.
//
// Run with: npm test

import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-32+";
process.env.R2_ACCOUNT_ID ??= "test";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";
process.env.R2_PUBLIC_URL ??= "https://images.test";

const { pool } = await import("../src/config/db.js");
const { normaliseClientIp, REVOKE_REASON } = await import(
  "../src/config/auth.policy.js"
);
const { RefreshTokenRepository } = await import(
  "../src/repository/refresh_token.repository.js"
);
const { CustomerRepository, uniqueFieldOf } = await import(
  "../src/repository/customer.repository.js"
);
const { AdminRepository } = await import("../src/repository/admin.repository.js");
const { CustomerAddressRepository, ADDRESS_RULE } = await import(
  "../src/repository/customer_address.repository.js"
);
const { WishlistRepository, WISHLIST_RULE } = await import(
  "../src/repository/wishlist.repository.js"
);
const { SessionService } = await import("../src/services/session.service.js");
const { CustomerAuthService } = await import(
  "../src/services/customer.auth.service.js"
);
const { CustomerService } = await import("../src/services/customer.service.js");
const { CustomerAddressService } = await import(
  "../src/services/customer_address.service.js"
);
const { WishlistService } = await import("../src/services/wishlist.service.js");
const { validateUpdateCustomer } = await import(
  "../src/validators/customer.validator.js"
);
const { requireAdmin } = await import("../src/middlewares/authorize.middleware.js");
const { generateRefreshToken, verifyToken } = await import("../src/utils/jwt.js");

afterEach(() => mock.restoreAll());

/** The error a promise rejected with, or null if it resolved. */
const rejection = async (promise) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
};

// ============================================================
// A STAND-IN POOL
// ============================================================

/**
 * Replaces pool.connect with one fake client and counts how many
 * connections were asked for. withTransaction only ever calls
 * BEGIN / COMMIT / ROLLBACK on it directly; everything else here goes
 * through stubbed repository methods.
 */
const stubPool = () => {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  };

  const connect = mock.method(pool, "connect", async () => client);

  return { client, connect };
};

const liveRow = (overrides = {}) => ({
  id: randomUUID(),
  family_id: randomUUID(),
  subject_id: randomUUID(),
  typ: "customer",
  expires_at: new Date(Date.now() + 86_400_000),
  used_at: null,
  revoked_at: null,
  revoked_reason: null,
  expired: false,
  ms_since_use: null,
  within_grace: false,
  ...overrides,
});

const refreshTokenFor = (row) =>
  generateRefreshToken({
    sub: row.subject_id,
    typ: row.typ,
    fam: row.family_id,
    jti: randomUUID(),
  });

// ============================================================
// HIGH-1 — ONE CONNECTION PER RENEWAL
// ============================================================

describe("SessionService.renew (HIGH-1)", () => {
  it("hands loadSubject the transaction's client", async () => {
    const { client, connect } = stubPool();
    const row = liveRow();

    mock.method(RefreshTokenRepository, "findForUpdate", async () => row);
    mock.method(RefreshTokenRepository, "markUsed", async () => true);
    mock.method(RefreshTokenRepository, "insert", async () => ({}));

    let seen;

    await SessionService.renew({
      token: refreshTokenFor(row),
      typ: "customer",
      loadSubject: async (_id, txClient) => {
        seen = txClient;
        return { email: "a@b.co", role: "customer" };
      },
    });

    assert.equal(seen, client);
    assert.equal(connect.mock.callCount(), 1, "exactly one pool connection");
  });

  it("customer refresh looks the account up on that client, not the pool", async () => {
    const { client } = stubPool();
    const row = liveRow();

    mock.method(RefreshTokenRepository, "findForUpdate", async () => row);
    mock.method(RefreshTokenRepository, "markUsed", async () => true);
    mock.method(RefreshTokenRepository, "insert", async () => ({}));

    const findById = mock.method(CustomerRepository, "findById", async () => ({
      id: row.subject_id,
      email: "a@b.co",
    }));

    await CustomerAuthService.refresh({ token: refreshTokenFor(row) });

    assert.equal(findById.mock.calls[0].arguments[1]?.client, client);
  });

  it("puts the family on the access token, for change-password", async () => {
    stubPool();
    const row = liveRow();

    mock.method(RefreshTokenRepository, "findForUpdate", async () => row);
    mock.method(RefreshTokenRepository, "markUsed", async () => true);
    mock.method(RefreshTokenRepository, "insert", async () => ({}));

    const session = await SessionService.renew({
      token: refreshTokenFor(row),
      typ: "customer",
      loadSubject: async () => ({ email: "a@b.co", role: "customer" }),
    });

    assert.equal(verifyToken(session.accessToken).fam, row.family_id);
  });
});

// ============================================================
// CLOCK SKEW — THE DATABASE DECIDES
// ============================================================

describe("SessionService.renew grace window (clock skew)", () => {
  const renewWith = (row) => {
    stubPool();

    mock.method(RefreshTokenRepository, "findForUpdate", async () => row);
    mock.method(RefreshTokenRepository, "markUsed", async () => true);
    mock.method(RefreshTokenRepository, "insert", async () => ({}));
    const revoke = mock.method(RefreshTokenRepository, "revokeFamily", async () => 1);

    return {
      revoke,
      result: rejection(
        SessionService.renew({
          token: refreshTokenFor(row),
          typ: "customer",
          loadSubject: async () => ({ email: "a@b.co", role: "customer" }),
        }),
      ),
    };
  };

  it("trusts within_grace even when the host clock says the burn is old", async () => {
    // used_at an hour ago by this process's clock; the database says
    // it is inside the window. The database is the one that stamped it.
    const { result, revoke } = renewWith(
      liveRow({
        used_at: new Date(Date.now() - 3_600_000),
        ms_since_use: 1_500,
        within_grace: true,
      }),
    );

    assert.equal(await result, null);
    assert.equal(revoke.mock.callCount(), 0);
  });

  it("treats a burn the database puts outside the window as reuse", async () => {
    // used_at is "in the future" by the host's clock — the ~2 s skew —
    // and the database still says it is past the window.
    const { result, revoke } = renewWith(
      liveRow({
        used_at: new Date(Date.now() + 2_000),
        ms_since_use: 60_000,
        within_grace: false,
      }),
    );

    assert.equal((await result)?.code, "REFRESH_REUSED");
    assert.equal(revoke.mock.callCount(), 1);
  });

  it("refuses a row the database says has expired", async () => {
    const { result } = renewWith(
      liveRow({ expires_at: new Date(Date.now() + 60_000), expired: true }),
    );

    assert.equal((await result)?.code, "REFRESH_INVALID");
  });
});

// ============================================================
// MED-2 — AN ADDRESS INET WILL TAKE
// ============================================================

describe("normaliseClientIp (MED-2)", () => {
  it("keeps valid IPv4 and IPv6", () => {
    assert.equal(normaliseClientIp("10.77.1.30"), "10.77.1.30");
    assert.equal(normaliseClientIp("::ffff:10.0.0.1"), "::ffff:10.0.0.1");
    assert.equal(normaliseClientIp(" 2001:db8::1 "), "2001:db8::1");
  });

  it("strips an IPv6 zone id", () => {
    assert.equal(normaliseClientIp("fe80::1%eth0"), "fe80::1");
  });

  it("drops anything INET would refuse", () => {
    assert.equal(normaliseClientIp("10.77.1.300"), null);
    assert.equal(normaliseClientIp("not-an-ip"), null);
    assert.equal(normaliseClientIp(""), null);
    assert.equal(normaliseClientIp(undefined), null);
    assert.equal(normaliseClientIp(["1.2.3.4"]), null);
  });

  it("insert never sends a bad address to Postgres", async () => {
    const sent = [];
    const client = {
      query: async (_text, params) => {
        sent.push(params);
        return { rows: [{}] };
      },
    };

    await RefreshTokenRepository.insert(
      {
        token: "t",
        familyId: randomUUID(),
        subjectId: randomUUID(),
        typ: "customer",
        expiresAt: new Date(),
        ip: "not-an-ip",
      },
      client,
    );

    assert.equal(sent.length, 1, "one statement, no retry");
    assert.equal(sent[0][6], null);
  });
});

// ============================================================
// UNIQUE VIOLATIONS — BOTH SCHEMAS
// ============================================================

describe("uniqueFieldOf", () => {
  it("recognises the live constraint names", () => {
    assert.equal(uniqueFieldOf({ constraint: "customers_email_key" }), "email");
    assert.equal(uniqueFieldOf({ constraint: "customers_phone_key" }), "phone");
  });

  it("recognises the migration index names", () => {
    assert.equal(uniqueFieldOf({ constraint: "customers_email_unique" }), "email");
    assert.equal(uniqueFieldOf({ constraint: "customers_phone_unique" }), "phone");
  });

  it("falls back to the column in detail", () => {
    assert.equal(
      uniqueFieldOf({
        constraint: "something_else",
        detail: "Key (lower(email::text))=(a@b.co) already exists.",
      }),
      "email",
    );
    assert.equal(uniqueFieldOf({ detail: "Key (phone)=(99) already exists." }), "phone");
    assert.equal(uniqueFieldOf({ constraint: "customers_pkey" }), null);
  });
});

describe("CustomerService uniqueness races", () => {
  const raceOn = (field) => {
    mock.method(CustomerRepository, "findByEmail", async () => null);
    mock.method(CustomerRepository, "findByPhone", async () => null);
    mock.method(CustomerRepository, "save", async () => {
      throw Object.assign(new Error("dup"), {
        code: field === "email" ? "CUSTOMER_EMAIL_EXISTS" : "CUSTOMER_PHONE_EXISTS",
      });
    });
  };

  it("a concurrent registration is a 409 with a field map", async () => {
    raceOn("email");
    mock.method(CustomerRepository, "isHeldByClosedAccount", async () => false);

    const error = await rejection(
      CustomerService.registerCustomer("Meera", "m@x.co", "9876543210", "password1"),
    );

    assert.equal(error.statusCode, 409);
    assert.equal(error.errors.email, "Email already registered");
  });

  it("a closed account's email says so", async () => {
    raceOn("email");
    mock.method(CustomerRepository, "isHeldByClosedAccount", async () => true);

    const error = await rejection(
      CustomerService.registerCustomer("Meera", "m@x.co", "9876543210", "password1"),
    );

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "CUSTOMER_EMAIL_CLOSED_ACCOUNT");
    assert.match(error.errors.email, /closed account/);
  });

  it("editing onto a closed account's phone is a 409, not a 500", async () => {
    const id = randomUUID();

    mock.method(CustomerRepository, "findById", async () => ({
      id,
      name: "Meera",
      email: "m@x.co",
      phone: "9876543210",
    }));
    mock.method(CustomerRepository, "findByPhone", async () => null);
    mock.method(CustomerRepository, "update", async () => {
      throw Object.assign(new Error("dup"), { code: "CUSTOMER_PHONE_EXISTS" });
    });
    mock.method(CustomerRepository, "isHeldByClosedAccount", async () => true);

    const error = await rejection(
      CustomerService.updateCustomer(id, undefined, undefined, "9123456780"),
    );

    assert.equal(error.statusCode, 409);
    assert.match(error.errors.phone, /closed account/);
  });
});

// ============================================================
// BUG-4 — NULL IN AN UPDATE BODY
// ============================================================

describe("validateUpdateCustomer (BUG-4)", () => {
  const run = (body) => {
    try {
      validateUpdateCustomer({ body }, {}, () => {});
      return null;
    } catch (error) {
      return error;
    }
  };

  it("refuses null fields with a 400 and a field map", () => {
    const error = run({ name: null, phone: null });

    assert.equal(error.statusCode, 400);
    assert.equal(error.errors.name, "Name cannot be empty");
    assert.equal(error.errors.phone, "Phone number cannot be empty");
  });

  it("still accepts a normal partial update", () => {
    assert.equal(run({ name: "  Meera  " }), null);
  });

  it("survives a request with no body", () => {
    assert.equal(run(undefined)?.statusCode, 400);
  });
});

// ============================================================
// BUG-6 — CHANGING A PASSWORD ENDS THE OTHER SESSIONS
// ============================================================

describe("CustomerService.changePassword (BUG-6)", () => {
  const signedIn = () => {
    mock.method(CustomerRepository, "findByIdForAuth", async () => ({
      id: "c1",
      password: "hash",
    }));
    mock.method(CustomerService, "verifyPassword", async () => true);
    mock.method(CustomerRepository, "updatePassword", async () => ({ id: "c1" }));
  };

  it("revokes every family but the caller's", async () => {
    signedIn();
    const revoke = mock.method(RefreshTokenRepository, "revokeAllForSubject", async () => 3);

    const result = await CustomerService.changePassword("c1", "old-pass1", "new-pass1", {
      currentFamilyId: "fam-1",
    });

    const [subject, typ, reason, options] = revoke.mock.calls[0].arguments;

    assert.equal(subject, "c1");
    assert.equal(typ, "customer");
    assert.equal(reason, REVOKE_REASON.PASSWORD_CHANGE);
    assert.deepEqual(options, { exceptFamilyId: "fam-1" });
    assert.deepEqual(result, { sessionsRevoked: 3, keptCurrentSession: true });
  });

  it("revokes all of them when the caller's session is unknown", async () => {
    signedIn();
    const revoke = mock.method(RefreshTokenRepository, "revokeAllForSubject", async () => 2);

    const result = await CustomerService.changePassword("c1", "old-pass1", "new-pass1");

    assert.deepEqual(revoke.mock.calls[0].arguments[3], { exceptFamilyId: null });
    assert.equal(result.keptCurrentSession, false);
  });

  it("falls back to password_reset while the CHECK lacks password_change", async () => {
    const reasons = [];

    mock.method(pool, "query", async (_text, params) => {
      reasons.push(params[2]);

      if (params[2] === REVOKE_REASON.PASSWORD_CHANGE) {
        throw Object.assign(new Error("check"), { code: "23514" });
      }

      return { rowCount: 4 };
    });

    const revoked = await RefreshTokenRepository.revokeAllForSubject(
      randomUUID(),
      "customer",
      REVOKE_REASON.PASSWORD_CHANGE,
    );

    assert.equal(revoked, 4);
    assert.deepEqual(reasons, [
      REVOKE_REASON.PASSWORD_CHANGE,
      REVOKE_REASON.PASSWORD_RESET,
    ]);
  });
});

// ============================================================
// BUG-5 / BUG-7 / BUG-8 — ADDRESS BOOK AND WISHLIST
// ============================================================

const ruled = (key, rule) => Object.assign(new Error(rule), { [key]: rule });

const ADDRESS_BODY = {
  line1: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
};

describe("CustomerAddressService writes", () => {
  it("passes the limit to the repository instead of counting first", async () => {
    const create = mock.method(CustomerAddressRepository, "create", async () => ({
      id: "a1",
      is_default: true,
    }));
    const count = mock.method(CustomerAddressRepository, "countByCustomer", async () => 0);

    await CustomerAddressService.create("c1", ADDRESS_BODY);

    assert.equal(count.mock.callCount(), 0, "no count outside the lock");
    assert.deepEqual(create.mock.calls[0].arguments[2], { maxAddresses: 3 });
  });

  it("the limit is a 409", async () => {
    mock.method(CustomerAddressRepository, "create", async () => {
      throw ruled("addressRule", ADDRESS_RULE.LIMIT_REACHED);
    });

    const error = await rejection(CustomerAddressService.create("c1", ADDRESS_BODY));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "ADDRESS_LIMIT_REACHED");
  });

  it("a closed account's token is refused (BUG-7)", async () => {
    mock.method(CustomerAddressRepository, "create", async () => {
      throw ruled("addressRule", ADDRESS_RULE.ACCOUNT_CLOSED);
    });

    const error = await rejection(CustomerAddressService.create("c1", ADDRESS_BODY));

    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "SESSION_INVALID");
  });

  it("a default-flag collision is a 409, not a 500", async () => {
    mock.method(CustomerAddressRepository, "setDefault", async () => {
      throw Object.assign(new Error("dup"), {
        code: "23505",
        constraint: "uq_customer_addresses_one_default",
      });
    });

    const error = await rejection(
      CustomerAddressService.setDefault("c1", randomUUID()),
    );

    assert.equal(error.statusCode, 409);
  });
});

describe("WishlistService writes", () => {
  const PRODUCT = randomUUID();

  it("an inactive product is a 404 (BUG-8)", async () => {
    mock.method(WishlistRepository, "add", async () => {
      throw ruled("wishlistRule", WISHLIST_RULE.PRODUCT_UNAVAILABLE);
    });

    const error = await rejection(WishlistService.add("c1", PRODUCT));

    assert.equal(error.statusCode, 404);
    assert.equal(error.code, "PRODUCT_NOT_FOUND");
  });

  it("the cap is a 409", async () => {
    mock.method(WishlistRepository, "add", async () => {
      throw ruled("wishlistRule", WISHLIST_RULE.LIMIT_REACHED);
    });

    const error = await rejection(WishlistService.add("c1", PRODUCT));

    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "WISHLIST_LIMIT_REACHED");
  });

  it("merge hands the cap to the repository (BUG-8)", async () => {
    const addMany = mock.method(WishlistRepository, "addMany", async () => 0);
    mock.method(WishlistRepository, "listByCustomer", async () => []);

    await WishlistService.merge("c1", [PRODUCT]);

    assert.deepEqual(addMany.mock.calls[0].arguments[2], { maxItems: 200 });
  });
});

// ============================================================
// BUG-7, ADMIN SIDE
// ============================================================

describe("requireAdmin re-reads the account", () => {
  const req = (role = "super_admin") => ({
    user: { id: randomUUID(), typ: "admin", role },
    method: "GET",
    originalUrl: "/x",
  });

  it("refuses a deactivated admin's live token", async () => {
    mock.method(AdminRepository, "findById", async () => ({ active: false }));

    const error = await rejection(requireAdmin(req(), {}, () => {}));

    assert.equal(error.statusCode, 401);
    assert.equal(error.code, "SESSION_INVALID");
  });

  it("takes the role from the row, so a demotion bites at once", async () => {
    mock.method(AdminRepository, "findById", async () => ({
      active: true,
      role: "admin",
    }));

    const request = req("super_admin");
    let passed = false;

    await requireAdmin(request, {}, () => {
      passed = true;
    });

    assert.equal(passed, true);
    assert.equal(request.user.role, "admin");
  });
});
