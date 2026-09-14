// src/repository/refresh_token.repository.js
//
// The `refresh_tokens` table — the server's record of who is signed in.
//
// One method here is not ordinary and is the reason the file has this
// shape: `rotate`. Exchanging a refresh token is read-then-write across
// two rows, and the gap between the read and the write is where every
// interesting failure lives. Two tabs refreshing at the same instant
// must not both succeed, or the session forks into two chains and the
// loser's next refresh looks exactly like a theft. So the read takes a
// row lock, and the burn and the issue happen on the same client inside
// one transaction — the pattern PaymentRepository.withSessionLock
// already established for the money path.
//
// Nothing in this file trusts the token it is given. The hash is the
// lookup key and the row is the authority; a token whose hash matches
// nothing is simply not a session, whatever its signature says.

import { query } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { hashToken, REVOKE_REASON } from "../config/auth.policy.js";

const handleDatabaseError = (error, operation, context = {}) => {
  logger.error(`Refresh token repository error: ${operation}`, {
    operation,
    ...context,
    code: error?.code,
    constraint: error?.constraint,
    message: error?.message,
  });

  return error;
};

/**
 * Runs on a transaction's client when there is one, and on the pool
 * otherwise.
 *
 * `insert` and `findForUpdate` have to be able to do both: issuing at
 * login is a single statement that wants a pooled query, while the same
 * two inside `rotate` must run on the client holding the lock or they
 * would neither see nor be protected by its transaction.
 */
const runner = (client) => (client ? client.query.bind(client) : query);

// Not frozen, matching PaymentRepository and OrderRepository: the
// repository layer is where tests substitute a stand-in, and
// `mock.method` cannot redefine a property on a frozen object.
export const RefreshTokenRepository = {
  // ==========================================================
  // ISSUE
  // ==========================================================

  /**
   * Record a newly signed refresh token.
   *
   * @param {object}  params
   * @param {string}  params.token      the signed JWT — hashed here, never stored
   * @param {string}  params.familyId   the session family this belongs to
   * @param {string}  params.subjectId  admin or customer id
   * @param {string}  params.typ        "admin" | "customer"
   * @param {Date}    params.expiresAt  from the token's own exp claim
   * @param {string}  [params.userAgent]
   * @param {string}  [params.ip]
   * @param {import('pg').PoolClient} [client]
   */
  async insert(
    { token, familyId, subjectId, typ, expiresAt, userAgent, ip },
    client,
  ) {
    try {
      const { rows } = await runner(client)(
        `
        INSERT INTO refresh_tokens
          (family_id, subject_id, typ, token_hash, expires_at, user_agent, ip)
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::inet)
        RETURNING id, family_id, subject_id, typ, expires_at, created_at
        `,
        [
          familyId,
          subjectId,
          typ,
          hashToken(token),
          expiresAt,
          // Bounded before it reaches the column: a header is
          // attacker-controlled and TEXT has no length of its own, so
          // without this a script could write megabytes per login.
          userAgent ? String(userAgent).slice(0, 512) : null,
          // An unparseable address must not cost somebody their login —
          // INET would reject it and take the whole INSERT down with it.
          ip ?? null,
        ],
      );

      return rows[0];
    } catch (error) {
      // Postgres refuses an INET it cannot parse (22P02). The address is
      // provenance, not authorization, so it is dropped and the session
      // is still created.
      if (error?.code === "22P02") {
        logger.warn("Unparseable client address on refresh token, storing null", {
          subjectId,
          typ,
        });

        return RefreshTokenRepository.insert(
          { token, familyId, subjectId, typ, expiresAt, userAgent, ip: null },
          client,
        );
      }

      throw handleDatabaseError(error, "insert", { subjectId, typ });
    }
  },

  // ==========================================================
  // LOOKUP
  // ==========================================================

  /**
   * Find a token's row and hold it for the rest of the transaction.
   *
   * FOR UPDATE is what serialises two simultaneous refreshes of the same
   * token. Without it both would read `used_at IS NULL`, both would
   * proceed, and one session would become two — after which the next
   * refresh on the abandoned chain would present a rotated-out token and
   * be treated as a theft. With it, the second waits, sees `used_at`
   * set, and takes the reuse path... which is still wrong for the
   * innocent double-refresh case, and is why `rotate` below tolerates a
   * brief grace window rather than revoking on sight.
   *
   * @param {import('pg').PoolClient} client  required — FOR UPDATE needs a transaction
   */
  async findForUpdate(token, client) {
    try {
      const { rows } = await client.query(
        `
        SELECT id, family_id, subject_id, typ,
               expires_at, used_at, revoked_at, revoked_reason, created_at
        FROM refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE
        `,
        [hashToken(token)],
      );

      return rows[0] ?? null;
    } catch (error) {
      throw handleDatabaseError(error, "findForUpdate");
    }
  },

  // ==========================================================
  // BURN
  // ==========================================================

  /**
   * Mark a token as exchanged.
   *
   * Guarded on `used_at IS NULL` and reports whether it won, so the
   * caller never has to assume: if this returns false, another
   * transaction burned the same row first and this one is looking at a
   * reuse.
   */
  async markUsed(id, client) {
    try {
      const { rowCount } = await client.query(
        `
        UPDATE refresh_tokens
        SET used_at = NOW()
        WHERE id = $1::uuid AND used_at IS NULL
        `,
        [id],
      );

      return rowCount === 1;
    } catch (error) {
      throw handleDatabaseError(error, "markUsed", { id });
    }
  },

  // ==========================================================
  // REVOKE
  // ==========================================================

  /**
   * End a whole session.
   *
   * The unit is the family, not the row, because a session that has
   * refreshed forty times is forty rows and every one of them has to
   * stop working. Already-revoked rows are left alone so the first
   * reason recorded is the true one — a logout after a reuse detection
   * should not overwrite the evidence of the reuse.
   *
   * @returns {Promise<number>} rows revoked
   */
  async revokeFamily(familyId, reason = REVOKE_REASON.LOGOUT, client) {
    try {
      const { rowCount } = await runner(client)(
        `
        UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $2
        WHERE family_id = $1::uuid AND revoked_at IS NULL
        `,
        [familyId, reason],
      );

      return rowCount;
    } catch (error) {
      throw handleDatabaseError(error, "revokeFamily", { familyId });
    }
  },

  /**
   * End every session an account has.
   *
   * The lever for a compromised password, and the basis for a "sign out
   * everywhere" button. Nothing calls it yet; it is here because the
   * index that makes it cheap is already in the migration and a
   * revocation story with no way to say "all of them" is half a story.
   *
   * @returns {Promise<number>} rows revoked
   */
  async revokeAllForSubject(subjectId, typ, reason = REVOKE_REASON.LOGOUT) {
    try {
      const { rowCount } = await query(
        `
        UPDATE refresh_tokens
        SET revoked_at = NOW(), revoked_reason = $3
        WHERE subject_id = $1::uuid AND typ = $2 AND revoked_at IS NULL
        `,
        [subjectId, typ, reason],
      );

      return rowCount;
    } catch (error) {
      throw handleDatabaseError(error, "revokeAllForSubject", {
        subjectId,
        typ,
      });
    }
  },

  // ==========================================================
  // HOUSEKEEPING
  // ==========================================================

  /**
   * Delete rows that can no longer authorise anything.
   *
   * A revoked or expired row still answers one question — "why was I
   * signed out?" — so neither is deleted the moment it dies. A month
   * past expiry is well beyond anyone asking, and past that the table
   * is only growing.
   *
   * Not scheduled. It is called at startup, where a few hundred
   * milliseconds once per deploy is invisible and a cron nobody set up
   * is not.
   *
   * @returns {Promise<number>} rows deleted
   */
  async deleteExpired() {
    try {
      const { rowCount } = await query(
        `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW() - INTERVAL '30 days'
        `,
      );

      return rowCount;
    } catch (error) {
      throw handleDatabaseError(error, "deleteExpired");
    }
  },
};
