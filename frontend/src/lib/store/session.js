/**
 * The shopper's session, held in this browser.
 *
 * This file used to fake accounts entirely on the client — a list of
 * users in localStorage and a password check that ran in the page. It
 * does not any more. `POST /customers/auth/login` exists (F-01.02), so
 * what is stored here is a real JWT the server signed and verifies on
 * every request, and nothing in this file is trusted by anything.
 *
 * Two things are stored, and only one of them is a credential:
 *
 *   token   the JWT. This is the session. Sent as a Bearer header.
 *   user    a cached { id, name, email, phone } for first paint, so a
 *           returning shopper does not watch the header flicker from
 *           signed-out to signed-in while /me is in flight. It is
 *           re-fetched and overwritten on boot, and it is never the
 *           basis for a permission decision — the server decides that
 *           from the token.
 *
 * Storage is localStorage, the same trade-off the admin panel makes:
 * it survives a refresh and works across tabs, and it is readable by
 * any script that runs on the page. An httpOnly cookie would not have
 * that property.
 *
 * Kept framework-free and outside the components so that both
 * <AuthProvider> and <StoreProvider> can read the session without
 * importing each other.
 */

const SESSION_KEY = "sb.customer.session";

// ============================================================
// STORAGE
// ============================================================

function readRaw() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // A half-written or hand-edited record is treated as signed out
    // rather than being allowed to produce a user with no id to key
    // the wishlist by, or a session with no token to send.
    if (!parsed || typeof parsed.token !== "string" || !parsed.token) {
      return null;
    }

    if (!parsed.user || typeof parsed.user.id !== "string" || !parsed.user.id) {
      return null;
    }

    return parsed;
  } catch {
    // Private mode, disabled storage, or a stale shape — treat as
    // signed out rather than crashing the storefront.
    return null;
  }
}

/** The whole session, or null. Null on the server, where there is no storage. */
export function readSessionRecord() {
  return readRaw();
}

/**
 * The signed-in shopper, or null.
 *
 * Kept as the module's headline export because <StoreProvider> reads it
 * synchronously on first paint to decide whose wishlist to show, and
 * that decision cannot wait for a round trip.
 */
export function readSession() {
  return readRaw()?.user ?? null;
}

/** The bearer token, or null. */
export function readToken() {
  return readRaw()?.token ?? null;
}

export function writeSession(token, user) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  } catch {
    /* the session simply will not survive a refresh */
  }

  emit();
}

/**
 * Replaces the cached identity, keeping the token.
 *
 * For when /me comes back with a name the shop corrected, or the
 * shopper edits their own profile — the credential has not changed,
 * only what we show.
 */
export function writeUser(user) {
  const current = readRaw();
  if (!current) return;

  writeSession(current.token, user);
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do — the session is already unreachable */
  }

  emit();
}

// ============================================================
// SUBSCRIPTION
// ============================================================
//
// A module-level store rather than component state, so signing out in
// one tab reaches the others. `storage` fires only in *other* tabs,
// which is why the writers above also emit locally.
//
// ============================================================

const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribe(listener) {
  listeners.add(listener);

  const onStorage = (event) => {
    if (event.key === SESSION_KEY || event.key === null) listener();
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
//
// The snapshot must be referentially stable between reads or React
// re-renders forever, so the parsed record is cached and only replaced
// when the underlying string actually changes.
//
// ============================================================

let cachedRaw;
let cachedRecord = null;

export function getSnapshot() {
  if (typeof window === "undefined") return null;

  let raw = null;

  try {
    raw = window.localStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRecord = readRaw();
  }

  return cachedRecord;
}

export function getServerSnapshot() {
  return null; // nobody is signed in as far as the server is concerned
}
