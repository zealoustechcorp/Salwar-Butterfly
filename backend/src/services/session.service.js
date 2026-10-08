// src/services/session.service.js
//
// Opening, renewing and ending a session — for both audiences.
//
// One module rather than a copy in each auth service, because the rules
// that matter here are not about who is signing in. Rotation, reuse
// detection and revocation are identical for an admin and a shopper,
// and a second copy of them is a second place for them to drift; the
// half that genuinely differs — how an account is looked up and what
// claims it carries — is passed in.
//
// The shape of a session:
//
//   login    signs an access token and a refresh token, opens a family,
//            writes one row.
//   refresh  burns the presented row, signs a new pair in the same
//            family, writes the next row.
//   logout   revokes the family.
//
// What makes any of it worth doing is the row. An access token is a
// signed assertion nothing can withdraw; the row behind the refresh
// token is what turns "please log out" into something the server can
// actually enforce.

import * as Sentry from "@sentry/node";

import { withTransaction } from "../config/db.js";
import {
  newFamilyId,
  REFRESH_REUSE_GRACE_MS,
  REVOKE_REASON,
  TOKEN_USE,
} from "../config/auth.policy.js";
import { RefreshTokenRepository } from "../repository/refresh_token.repository.js";
import {
  expiryOf,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

// ============================================================
// MESSAGES
// ============================================================

/**
 * One message for every way a refresh can fail, with one exception.
 *
 * A caller presenting a dead refresh token has exactly one thing to do
 * about it — sign in again — and which flavour of dead it was is not
 * information they need. It is, however, information an attacker
 * probing the endpoint would like: "expired" and "revoked" and "never
 * existed" are three different answers about whether a session was ever
 * real.
 *
 * The exception is reuse, which says so plainly. Somebody whose session
 * was cut short deserves to know it was cut short deliberately rather
 * than believing the shop is flaky — and by the time that message is
 * sent, the family is already revoked, so it gives an attacker nothing
 * they do not already have.
 */
const SESSION_ENDED = "Your session has ended. Please sign in again.";

const SESSION_COMPROMISED =
  "Your session was ended for security. Please sign in again.";

// ============================================================
// SIGNING
// ============================================================

/**
 * Sign a pair and record the refresh half.
 *
 * `familyId` is supplied by the caller: `login` mints a new one,
 * `refresh` passes through the family it is continuing, which is what
 * makes one sign-in one revocable unit however many times it renews.
 */
const issuePair = async (
  { subjectId, typ, claims, familyId, userAgent, ip },
  client,
) => {
  const accessToken = generateAccessToken({
    sub: subjectId,
    typ,
    ...claims,
  });

  // No claims beyond identity on this one. It is exchanged for an
  // access token that is signed fresh from the account row, so a role
  // baked in here would only be a stale copy of one — and the whole
  // reason refresh re-reads the account is to avoid exactly that.
  const refreshToken = generateRefreshToken({
    sub: subjectId,
    typ,
    fam: familyId,
    // Two logins in the same second would otherwise sign byte-identical
    // tokens and collide on the UNIQUE hash, failing the second one.
    jti: newFamilyId(),
  });

  const expiresAt = expiryOf(refreshToken);

  await RefreshTokenRepository.insert(
    { token: refreshToken, familyId, subjectId, typ, expiresAt, userAgent, ip },
    client,
  );

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt, familyId };
};

// ============================================================
// SERVICE
// ============================================================

export const SessionService = Object.freeze({
  // ==========================================================
  // OPEN
  // ==========================================================

  /**
   * Start a session for an account that has just proved who it is.
   *
   * Called only after the password has been verified — this function
   * checks no credentials and must never be reachable from anywhere
   * that has not already done so.
   *
   * @param {object} params
   * @param {string} params.subjectId
   * @param {string} params.typ        "admin" | "customer"
   * @param {object} params.claims     extra access-token claims (email, role)
   * @param {string} [params.userAgent]
   * @param {string} [params.ip]
   */
  async open({ subjectId, typ, claims, userAgent, ip }) {
    const session = await issuePair({
      subjectId,
      typ,
      claims,
      familyId: newFamilyId(),
      userAgent,
      ip,
    });

    logger.info("Session opened", {
      typ,
      subjectId,
      family: session.familyId,
    });

    return session;
  },

  // ==========================================================
  // RENEW
  // ==========================================================

  /**
   * Exchange a refresh token for a new pair.
   *
   * Everything cheap happens before Postgres is touched: a token with a
   * broken signature, an expired one, one for the wrong audience, or an
   * access token presented here by mistake are all refused on the
   * token's own contents.
   *
   * The rest runs in one transaction with the row locked, because the
   * read and the write have to be indivisible. Two tabs refreshing at
   * once would otherwise both read "unused" and both proceed, and the
   * session would quietly fork into two chains.
   *
   * `loadSubject` re-reads the account and returns the claims for the
   * new access token, or null if the account may no longer sign in.
   * That is what makes a deactivated admin's session die within fifteen
   * minutes instead of thirty days: the token is fine, the account is
   * not, and this is the only place that re-asks.
   *
   * @param {object}   params
   * @param {string}   params.token       the presented refresh token
   * @param {string}   params.typ         the audience of the endpoint it arrived at
   * @param {Function} params.loadSubject (subjectId) => claims | null
   * @param {string}   [params.userAgent]
   * @param {string}   [params.ip]
   */
  async renew({ token, typ, loadSubject, userAgent, ip }) {
    if (!token) {
      throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_MISSING");
    }

    // --------------------------------------------------------
    // THE TOKEN ITSELF
    // --------------------------------------------------------

    let decoded;

    try {
      decoded = verifyToken(token);
    } catch {
      // Expired, forged, or mangled. All the same answer, and none of
      // them worth a database round trip.
      throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_INVALID");
    }

    // An access token sent to the refresh endpoint. Harmless, but it
    // means a client is confused, and refusing it here keeps the two
    // halves of a session from ever being interchangeable.
    if (decoded.tok !== TOKEN_USE.REFRESH) {
      logger.warn("Non-refresh token presented to the refresh endpoint", {
        tok: decoded.tok ?? null,
        typ: decoded.typ ?? null,
      });

      throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_INVALID");
    }

    // A shopper's refresh cookie arriving at the admin refresh endpoint.
    // The cookies are named and path-scoped separately so this should be
    // unreachable; it is checked anyway, because "should be unreachable"
    // is not a security property.
    if (decoded.typ !== typ) {
      logger.warn("Refresh token presented to the wrong audience", {
        expected: typ,
        received: decoded.typ ?? null,
      });

      throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_INVALID");
    }

    // --------------------------------------------------------
    // THE ROW
    // --------------------------------------------------------
    //
    // Two of the outcomes below revoke a family and then refuse the
    // request, and those two cannot be thrown from inside the
    // transaction: withTransaction rolls back on a throw, which would
    // undo the revocation it had just performed. A reuse would be
    // reported and then silently forgiven — the alarm raised and the
    // door left open.
    //
    // So the transaction returns a verdict and commits, and the
    // refusal is thrown out here once the revocation is durable. The
    // checks above this point may still throw freely: none of them
    // have written anything to roll back.
    //
    // --------------------------------------------------------

    const outcome = await withTransaction(async (client) => {
      const row = await RefreshTokenRepository.findForUpdate(token, client);

      // A signature we issued, for a row that is not there. Either the
      // housekeeping sweep has been past, or the token predates a
      // database that was rebuilt. Not a session either way.
      if (!row) {
        throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_INVALID");
      }

      if (row.revoked_at) {
        // Logout already ended this, or reuse detection did. If it was
        // reuse, the holder of *this* token may well be the victim
        // rather than the thief, so they are told what happened.
        const compromised = row.revoked_reason === REVOKE_REASON.REUSE_DETECTED;

        throw ApiError.unauthorized(
          compromised ? SESSION_COMPROMISED : SESSION_ENDED,
          compromised ? "REFRESH_REUSED" : "REFRESH_REVOKED",
        );
      }

      // Belt and braces — the signature's own exp already covers this,
      // unless the row and the token were somehow signed apart.
      if (row.expires_at.getTime() <= Date.now()) {
        throw ApiError.unauthorized(SESSION_ENDED, "REFRESH_INVALID");
      }

      // ------------------------------------------------------
      // REUSE
      // ------------------------------------------------------
      //
      // This token has already been exchanged. Either two tabs woke up
      // together — milliseconds apart, on the same cookie — or a
      // rotated-out token has been replayed by somebody who kept a
      // copy. The grace window is what tells them apart; past it, there
      // is no way to know which of the two holders is legitimate, so
      // the whole family goes.

      if (row.used_at) {
        const sinceUse = Date.now() - row.used_at.getTime();

        if (sinceUse > REFRESH_REUSE_GRACE_MS) {
          await RefreshTokenRepository.revokeFamily(
            row.family_id,
            REVOKE_REASON.REUSE_DETECTED,
            client,
          );

          // Committed, then refused — see the note above the
          // transaction. Throwing here would roll the revocation back.
          return {
            kind: "reused",
            typ: row.typ,
            subjectId: row.subject_id,
            familyId: row.family_id,
            rotatedAt: row.used_at,
            sinceUse,
          };
        }

        logger.info("Concurrent refresh inside the grace window", {
          typ: row.typ,
          family: row.family_id,
          msSinceRotation: sinceUse,
        });
      } else {
        // The ordinary path. Guarded, and the guard is checked: losing
        // this race means another transaction burned the row first,
        // which is the same concurrent-tab situation as above and gets
        // the same tolerance rather than an error.
        const burned = await RefreshTokenRepository.markUsed(row.id, client);

        if (!burned) {
          logger.info("Lost the rotation race for a refresh token", {
            typ: row.typ,
            family: row.family_id,
          });
        }
      }

      // ------------------------------------------------------
      // THE ACCOUNT
      // ------------------------------------------------------
      //
      // Re-read rather than trusted from the token. A refresh is the
      // one moment in a thirty-day session where the shop gets to ask
      // "is this person still allowed in?", and deactivating an admin
      // has to mean something before their token happens to lapse.

      const claims = await loadSubject(row.subject_id);

      if (!claims) {
        await RefreshTokenRepository.revokeFamily(
          row.family_id,
          REVOKE_REASON.LOGOUT,
          client,
        );

        // Committed, then refused, for the same reason as reuse above:
        // a throw here would roll back the revocation and leave a
        // deactivated admin's session renewable.
        return {
          kind: "subject_gone",
          typ: row.typ,
          subjectId: row.subject_id,
          familyId: row.family_id,
        };
      }

      return {
        kind: "renewed",
        session: await issuePair(
          {
            subjectId: row.subject_id,
            typ: row.typ,
            claims,
            familyId: row.family_id,
            userAgent,
            ip,
          },
          client,
        ),
      };
    });

    // --------------------------------------------------------
    // THE VERDICT
    // --------------------------------------------------------
    //
    // Past this line the transaction has committed, so any revocation
    // it performed is durable and refusing the request cannot undo it.

    if (outcome.kind === "reused") {
      logger.error("Refresh token reuse detected — family revoked", {
        typ: outcome.typ,
        subjectId: outcome.subjectId,
        family: outcome.familyId,
        secondsSinceRotation: Math.round(outcome.sinceUse / 1000),
      });

      // The one event in this file worth waking somebody for: it means
      // a credential left the browser it was issued to.
      Sentry.withScope((scope) => {
        scope.setLevel("warning");
        scope.setTag("auth.audience", outcome.typ);
        scope.setContext("session", {
          subjectId: outcome.subjectId,
          family: outcome.familyId,
          rotatedAt: outcome.rotatedAt.toISOString(),
        });
        Sentry.captureMessage("Refresh token reuse detected");
      });

      throw ApiError.unauthorized(SESSION_COMPROMISED, "REFRESH_REUSED");
    }

    if (outcome.kind === "subject_gone") {
      logger.info("Refresh refused: account can no longer sign in", {
        typ: outcome.typ,
        subjectId: outcome.subjectId,
      });

      throw ApiError.unauthorized(SESSION_ENDED, "SESSION_INVALID");
    }

    return outcome.session;
  },

  // ==========================================================
  // CLOSE
  // ==========================================================

  /**
   * End the session a refresh token belongs to.
   *
   * Deliberately forgiving. Logout is the one action that must never
   * fail: a caller with a mangled cookie, an expired token or no token
   * at all wanted to be signed out, and telling them it did not work
   * leaves them believing they are still signed in when they are not.
   * So every failure is swallowed and the cookie is cleared regardless.
   *
   * @returns {Promise<boolean>} whether a family was actually revoked
   */
  async close({ token, typ }) {
    if (!token) return false;

    let decoded;

    try {
      decoded = verifyToken(token);
    } catch {
      // Expired tokens land here, and an expired session is already
      // over. Nothing to revoke and nothing to report.
      return false;
    }

    if (decoded.tok !== TOKEN_USE.REFRESH || decoded.typ !== typ) {
      return false;
    }

    try {
      const revoked = await RefreshTokenRepository.revokeFamily(
        decoded.fam,
        REVOKE_REASON.LOGOUT,
      );

      logger.info("Session closed", {
        typ,
        subjectId: decoded.sub,
        family: decoded.fam,
        rowsRevoked: revoked,
      });

      return revoked > 0;
    } catch (error) {
      // The database is unreachable. The client is about to drop its
      // tokens anyway and the access token expires within fifteen
      // minutes, so this is logged rather than raised.
      logger.error("Failed to revoke session on logout", {
        typ,
        family: decoded.fam,
        message: error?.message,
      });

      return false;
    }
  },
});
