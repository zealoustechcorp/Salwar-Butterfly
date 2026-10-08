/**
 * The admin's access token, held in this tab.
 *
 * In memory, not in localStorage, and that is the point of the whole
 * arrangement. A token any script on the page can read is a token any
 * *injected* script can read and carry away; a module variable dies
 * with the tab. What survives a reload instead is the refresh cookie,
 * which is httpOnly and which JavaScript — ours or anyone else's —
 * cannot see at all.
 *
 * The consequence is that a fresh page load starts with no token, so
 * the first thing this module does in a browser is ask the API for one
 * (`bootstrap`). Until that answer arrives nobody knows whether the
 * visitor is signed in, which is why the snapshot carries `ready`
 * alongside the token: without it, every reload would look like a
 * sign-out for as long as the round trip takes, and RequireAdmin would
 * bounce the admin to the login screen before their session had a
 * chance to come back.
 *
 * The token is a real JWT issued by POST /api/admin/auth/login. The
 * server signed it and verifies it on every request; nothing here is
 * trusted. Route protection remains client-side only (see RequireAdmin),
 * and the token is never read during SSR.
 *
 * Kept framework-free so both AdminAuthProvider and the api client can
 * reach it without importing a component.
 */

import { requestAccessToken, requestLogout } from "@/lib/api/refresh";

const SCOPE = "admin";

/**
 * A cross-tab signal, and deliberately not a credential.
 *
 * The token used to live in localStorage, which meant the browser's own
 * `storage` event carried a sign-out from one tab to the others for
 * free. A token in memory gives that up, and a shop owner who signs out
 * in one tab should not find the other still showing the panel. So a
 * meaningless counter is written on every sign-in and sign-out purely
 * so the event fires. It holds nothing worth stealing.
 */
const EPOCH_KEY = "sb.admin.epoch";

// ============================================================
// STATE
// ============================================================

/** @type {string | null} */
let accessToken = null;

/** Has the first refresh attempt finished, whatever its answer? */
let ready = false;

/**
 * The snapshot object, replaced only when something actually changes.
 *
 * useSyncExternalStore compares by reference and re-renders forever if
 * handed a fresh object each read, so this is cached rather than built
 * on demand.
 */
let snapshot = { token: null, ready: false };

const publish = () => {
  if (snapshot.token === accessToken && snapshot.ready === ready) return;

  snapshot = { token: accessToken, ready };
  emit();
};

// ============================================================
// STORAGE
// ============================================================

export function readToken() {
  return accessToken;
}

export function writeToken(token) {
  accessToken = token;
  ready = true;

  bumpEpoch();
  publish();
}

export function clearToken() {
  accessToken = null;
  ready = true;

  bumpEpoch();
  publish();
}

function bumpEpoch() {
  try {
    window.localStorage.setItem(EPOCH_KEY, String(Date.now()));
  } catch {
    /* private mode — the other tabs simply will not hear about it */
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================
//
// A page load has no token, so one is fetched before the panel decides
// anybody is signed out. Runs once per tab: the promise is kept so that
// several components mounting at once share one request rather than
// racing each other through the rotation.
//
// ============================================================

/** @type {Promise<string|null> | null} */
let inFlight = null;

let started = false;

function bootstrap() {
  if (started || typeof window === "undefined") return;

  started = true;
  renew();
}

/**
 * Fetch a new access token, or find out there is no session.
 *
 * De-duplicated: a burst of requests all failing with an expired token
 * at once must produce one refresh, not one per request. A second
 * rotation off an already-rotated token is exactly what the server
 * reads as a stolen credential.
 *
 * @returns {Promise<string|null>}
 */
export function renew() {
  if (inFlight) return inFlight;

  inFlight = requestAccessToken(SCOPE)
    .then((token) => {
      accessToken = token;
      ready = true;
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
 * Local first: signing out must not depend on the network, and the
 * server call is what revokes the family behind the cookie — the part
 * that makes this a real logout rather than a local gesture.
 */
export async function endSession() {
  clearToken();
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

  // The first subscriber is the panel mounting, which is the moment
  // worth asking whether this browser still has a session.
  bootstrap();

  const onStorage = (event) => {
    // Another tab signed in or out. Its token is not ours to read — the
    // cookie is shared, the memory is not — so this tab asks for its
    // own, which also covers the sign-out case by coming back null.
    if (event.key === EPOCH_KEY || event.key === null) renew();
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

/** For useSyncExternalStore. */
export function getSnapshot() {
  return snapshot;
}

/**
 * On the server there is no token and no way to find out whether there
 * should be — the refresh cookie is the browser's, and this render has
 * not got one.
 *
 * `ready: false` rather than `true`, deliberately: it means the server
 * renders the same "still deciding" state the client starts in, so
 * hydration matches and a returning admin never sees a flash of the
 * login screen before their session comes back.
 */
const SERVER_SNAPSHOT = { token: null, ready: false };

export function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}
