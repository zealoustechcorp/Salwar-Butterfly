/**
 * The shopper's session, held in this tab.
 *
 * This file used to fake accounts entirely on the client — a list of
 * users in localStorage and a password check that ran in the page. It
 * does not any more. `POST /customers/auth/login` exists (F-01.02), so
 * what is held here is a real JWT the server signed and verifies on
 * every request, and nothing in this file is trusted by anything.
 *
 * Two things are held, and only one of them is a credential — which is
 * why they are now kept in different places:
 *
 *   token   the access token. This is the credential, and it lives in
 *           memory only. A token in localStorage is readable by any
 *           script that runs on the page, and the shop's storefront
 *           carries reviews, stories and banners — the surfaces where
 *           injected content is most likely to appear. In memory it
 *           dies with the tab and cannot be carried away.
 *
 *   user    a cached { id, name, email, phone } for first paint, so a
 *           returning shopper does not watch the header flicker from
 *           signed-out to signed-in while the session is restored. This
 *           one stays in localStorage, because it is not a credential:
 *           it grants nothing, it is re-fetched and overwritten on
 *           boot, and it is never the basis for a permission decision —
 *           the server decides that from the token.
 *
 * What actually survives a reload is the refresh cookie, which is
 * httpOnly and which this file cannot read. A page load therefore
 * starts with a cached name and no token, and asks the API for one; the
 * snapshot carries `ready` so the storefront can tell "not signed in"
 * from "not known yet".
 *
 * Kept framework-free and outside the components so that both
 * <AuthProvider> and <StoreProvider> can read the session without
 * importing each other.
 */

import { requestAccessToken, requestLogout } from "@/lib/api/refresh";

const SCOPE = "customer";

/** The cached identity — not a credential. See the note above. */
const USER_KEY = "sb.customer.user";

// ============================================================
// STATE
// ============================================================

/** @type {string | null} */
let accessToken = null;

/** @type {object | null} */
let user = null;

let ready = false;
let hydratedUser = false;

/** Cached for referential stability; see the admin session module. */
let snapshot = { token: null, user: null, ready: false };

const publish = () => {
  if (
    snapshot.token === accessToken &&
    snapshot.user === user &&
    snapshot.ready === ready
  ) {
    return;
  }

  snapshot = { token: accessToken, user, ready };
  emit();
};

/**
 * Read the cached identity back, once per tab.
 *
 * A half-written or hand-edited record is treated as no cache rather
 * than being allowed to produce a user with no id to key the wishlist
 * by.
 */
function hydrateUser() {
  if (hydratedUser || typeof window === "undefined") return;

  hydratedUser = true;

  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed.id === "string" && parsed.id) {
      user = parsed;
    }
  } catch {
    /* private mode, disabled storage, or a stale shape — no cache */
  }
}

// ============================================================
// READS
// ============================================================

/** The whole session. Null-ish fields until the first refresh lands. */
export function readSessionRecord() {
  hydrateUser();
  return accessToken ? { token: accessToken, user } : null;
}

/**
 * The signed-in shopper, or null.
 *
 * Still the module's headline export, and still synchronous, because
 * <StoreProvider> reads it on first paint to decide whose wishlist to
 * show and that decision cannot wait for a round trip. It is the cached
 * copy that makes this possible — and the reason the cache was worth
 * keeping in storage when the token was not.
 */
export function readSession() {
  hydrateUser();
  return user;
}

/** The bearer token, or null. */
export function readToken() {
  return accessToken;
}

// ============================================================
// WRITES
// ============================================================

export function writeSession(token, nextUser) {
  accessToken = token;
  ready = true;

  if (nextUser !== undefined) writeUser(nextUser, { silent: true });

  publish();
}

/**
 * Replace the cached identity, keeping the token.
 *
 * For when /me comes back with a name the shop corrected, or the
 * shopper edits their own profile — the credential has not changed,
 * only what we show.
 */
export function writeUser(nextUser, { silent = false } = {}) {
  hydratedUser = true;
  user = nextUser ?? null;

  try {
    if (user) {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* the cached name simply will not survive a refresh */
  }

  if (!silent) publish();
}

export function clearSession() {
  accessToken = null;
  ready = true;

  writeUser(null, { silent: true });
  publish();
}

// ============================================================
// BOOTSTRAP
// ============================================================

/** @type {Promise<string|null> | null} */
let inFlight = null;

let started = false;

function bootstrap() {
  if (started || typeof window === "undefined") return;

  started = true;
  hydrateUser();
  renew();
}

/**
 * Fetch a new access token, or find out there is no session.
 *
 * De-duplicated for the reason the admin module's is: several requests
 * expiring together must produce one refresh. Two rotations off the
 * same token is what the server reads as a stolen credential.
 *
 * A null answer means the session is over, so the cached name goes with
 * it — leaving it would render a signed-in header for somebody who is
 * not.
 *
 * @returns {Promise<string|null>}
 */
export function renew() {
  if (inFlight) return inFlight;

  inFlight = requestAccessToken(SCOPE)
    .then((token) => {
      accessToken = token;
      ready = true;

      if (!token) writeUser(null, { silent: true });

      publish();

      return token;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

// ============================================================
// SIGN OUT
// ============================================================

/**
 * End the session here and on the server.
 *
 * Local first — signing out must not wait on the network — then the
 * call that revokes the family behind the cookie, which is what makes
 * this a real logout rather than a local gesture.
 */
export async function endSession() {
  clearSession();
  await requestLogout(SCOPE);
}

// ============================================================
// SUBSCRIPTION
// ============================================================

const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);

  bootstrap();

  const onStorage = (event) => {
    // Another tab signed in or out. Its token is not ours to read, so
    // this tab fetches its own — which returns null if the other tab
    // signed out, and a fresh token if it signed in.
    if (event.key === USER_KEY || event.key === null) {
      hydratedUser = false;
      hydrateUser();
      renew();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

// ============================================================
// SNAPSHOTS  (for useSyncExternalStore)
// ============================================================

export function getSnapshot() {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  hydrateUser();

  // hydrateUser may have filled in the cached identity after the last
  // publish, so the snapshot is reconciled here rather than left stale.
  if (snapshot.user !== user) {
    snapshot = { token: accessToken, user, ready };
  }

  return snapshot;
}

/**
 * Nobody is signed in as far as the server is concerned, and it cannot
 * find out — the refresh cookie belongs to the browser.
 *
 * `ready: false` so SSR renders the same undecided state the client
 * begins in; the storefront shows its signed-out header either way, so
 * this only stops a returning shopper's header from flickering.
 */
const SERVER_SNAPSHOT = { token: null, user: null, ready: false };

export function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}
