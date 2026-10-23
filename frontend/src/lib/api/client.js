/**
 * The one place the frontend talks to the Express API.
 *
 * Every admin module goes through here, and so does everything the
 * storefront does in the browser — signing in, checkout, payment, the
 * wishlist. The one thing that does not is the catalogue itself: it is
 * read on the server, from src/lib/store/catalogue.js, which fetches
 * with Next's caching options rather than through this client.
 *
 * Authentication. A call with no explicit `token` sends the stored
 * admin JWT if there is one. That default exists because the API was
 * closed off a router at a time, and without it every caller would have
 * to thread a token down from a component that has one. Pass
 * `token: null` to opt a genuinely public call out, so signing someone
 * up does not carry an admin's credentials — and note that every
 * storefront module names its token explicitly for that reason.
 *
 * Failures arrive as a thrown `ApiError` carrying
 * { code, message, fields, status }.
 *
 * One failure is handled rather than only reported: a 401 saying the
 * token has expired ends the session it belonged to before the error
 * is thrown (see ./expiry.js). Callers still get their ApiError — the
 * screen that made the call decides what to say — but nobody has to
 * remember to sign the browser out.
 */

import { readToken, renew as renewAdmin } from "@/lib/admin/session";
import {
  readToken as readCustomerToken,
  renew as renewCustomer,
} from "@/lib/store/session";
import { expireSession, isSessionEnded } from "./expiry";
import { beginUpload, carriesFile } from "./uploads";

// ============================================================
// CONFIG
// ============================================================

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

// ============================================================
// ERROR
// ============================================================

export class ApiError extends Error {
  constructor(code, message, fields = {}, status = 0) {
    super(message);

    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
    this.status = status;
  }
}

/**
 * A request that never reached the API — the server is down, the
 * port is wrong, or CORS rejected it. Worth distinguishing, because
 * "check the backend is running" is the useful thing to say.
 */
export const NETWORK_ERROR = "NETWORK_ERROR";

// ============================================================
// RENEWAL
// ============================================================

/**
 * Which session a rejected token belonged to, and how to renew it.
 *
 * Matched on the token itself rather than on the URL, the same way
 * expiry.js decides whose session to end: a browser with the admin
 * panel and the storefront both open holds two, and only the one that
 * issued the rejected credential should be touched. A token we do not
 * hold — one a caller passed in by hand — matches nothing and is not
 * renewed.
 */
function renewerFor(bearer) {
  if (!bearer) return null;
  if (bearer === readToken()) return renewAdmin;
  if (bearer === readCustomerToken()) return renewCustomer;

  return null;
}

/**
 * Tokens this client has already renewed away, mapped to the reader of
 * the session that replaced them.
 *
 * The de-duplication in the session modules only covers 401s that land
 * while the renewal is still in flight. A sibling request sent with the
 * same old token whose 401 arrives *after* the renewal finished no
 * longer matches either stored token, so renewerFor() rightly refuses
 * to renew again — but the request is not dead, it simply went out a
 * moment too early. Remembering which session each retired token
 * belonged to lets that straggler be replayed with whatever token the
 * session holds now. Small and bounded: only the last few rotations
 * can still have requests in the air.
 */
const retired = new Map();
const RETIRED_LIMIT = 8;

function retire(bearer, read) {
  retired.set(bearer, read);

  while (retired.size > RETIRED_LIMIT) {
    retired.delete(retired.keys().next().value);
  }
}

/**
 * The token to replay a rejected request with, when its session has
 * already moved on to a newer one — or null when it has not.
 */
function supersededToken(bearer, explicitToken) {
  if (!bearer) return null;

  // A call that took "whatever we have" means the admin session, so
  // whatever the admin session has *now* is the right answer, however
  // the token was replaced (a renewal here, or one prompted by another
  // tab signing in).
  const read =
    explicitToken === undefined ? readToken : retired.get(bearer);

  const current = read ? read() : null;

  return current && current !== bearer ? current : null;
}

// ============================================================
// UPLOAD TRANSPORT
// ============================================================

/**
 * fetch() for a request carrying a file, over XMLHttpRequest.
 *
 * fetch cannot report how much of a request body has been sent, and an
 * upload of twenty 5 MB photographs is long enough that the shop needs
 * to see it moving, and to be told not to close the tab. So these go out
 * over XHR, reporting to ./uploads.js, and resolve to the small slice of
 * a Response that request() reads, so nothing below has to know which
 * transport was used.
 */
function sendWithProgress(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    const tracker = beginUpload();

    const onAbort = () => xhr.abort();

    const settle = () => {
      tracker.end();
      signal?.removeEventListener("abort", onAbort);
    };

    xhr.open(method, url);
    // The equivalent of credentials: "include" (see request() below).
    xhr.withCredentials = true;

    Object.entries(headers).forEach(([name, value]) => {
      xhr.setRequestHeader(name, value);
    });

    xhr.upload.onprogress = (event) => {
      tracker.progress(event.loaded, event.lengthComputable ? event.total : 0);
    };

    xhr.onload = () => {
      settle();
      const text = xhr.responseText;

      resolve({
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        json: async () => JSON.parse(text),
      });
    };

    // Shaped like fetch's failures, so request() treats them the same.
    xhr.onerror = () => {
      settle();
      reject(new TypeError("Network request failed"));
    };

    xhr.onabort = () => {
      settle();
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort);
    xhr.send(body);
  });
}

// ============================================================
// REQUEST
// ============================================================

/**
 * @param {string} path      path below the base URL, e.g. "/admin/auth/login"
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object|FormData} [options.body]  JSON-serialized, unless it is a
 *                                          FormData — routes that accept a
 *                                          file upload need multipart
 * @param {string|null} [options.token]  bearer token. Omitted, the stored
 *                                       admin token is used if present;
 *                                       `null` forces an anonymous call
 * @param {boolean} [options.envelope]  resolve to { data, meta } instead of
 *                                      just data — for paginated lists
 * @param {AbortSignal} [options.signal]
 */
export async function request(path, options = {}) {
  const {
    method = "GET",
    body,
    token,
    signal,
    envelope = false,
    // Set by the retry below, never by a caller. One renewal per
    // request: if the replay is rejected too, the session really is
    // over and looping would only rotate tokens at the server until it
    // decided it was being attacked.
    isRetry = false,
  } = options;

  // `undefined` means "whatever we have"; `null` means "nothing".
  const bearer = token === undefined ? readToken() : token;

  const headers = {};

  // A FormData body must set its own Content-Type: the browser appends the
  // multipart boundary, and naming the header here would strip it.
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }

  let response;

  try {
    // A file goes over XHR so its progress can be shown; everything
    // else, including a multipart form with no file in it, stays on fetch.
    const send = carriesFile(body) ? sendWithProgress : fetch;

    response = await send(`${BASE_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal,
      // The refresh cookie is httpOnly and path-scoped to the two auth
      // routers, so it is not actually sent on calls like this one —
      // but login and logout are reached through this client too, and
      // without this the browser would discard the Set-Cookie that
      // starts the session in the first place.
      credentials: "include",
    });
  } catch (error) {
    // Let cancellation propagate — a caller that aborted is not
    // looking at an error, it is unmounting.
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      NETWORK_ERROR,
      "Could not reach the server. Check that the backend is running.",
      {},
      0,
    );
  }

  // 204 and other empty bodies
  if (response.status === 204) {
    return envelope ? { data: null, meta: null } : null;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const code = payload?.code ?? "REQUEST_FAILED";

    // The credential we just sent is finished. An access token now
    // lasts fifteen minutes, so this is the ordinary state of any tab
    // left open — not an event, and not something the shopper should
    // ever see.
    //
    // So the first response is to renew rather than to sign out: swap
    // the dead token for a fresh one off the refresh cookie and replay
    // the request. The renewal is de-duplicated inside the session
    // module, so a screen that fired six calls at once causes one
    // refresh and six replays.
    //
    // Only when that fails — no cookie, a revoked family, a logout in
    // another tab — is the session actually over, and the original
    // behaviour takes over.
    if (isSessionEnded(response.status, code)) {
      // Already renewed by a sibling request: replay with the new token
      // instead of renewing again (a second rotation off a rotated
      // token reads as theft at the server) or giving up.
      const current = isRetry ? null : supersededToken(bearer, token);

      if (current) {
        return request(path, { ...options, token: current, isRetry: true });
      }

      const renewer = isRetry ? null : renewerFor(bearer);

      if (renewer) {
        const read = renewer === renewAdmin ? readToken : readCustomerToken;
        const renewed = await renewer();

        if (renewed) {
          retire(bearer, read);
          return request(path, { ...options, token: renewed, isRetry: true });
        }
      }

      // Sign out of the session the dead token came from, so it does
      // not sit there failing every request after this one.
      expireSession(bearer, code);
    }

    throw new ApiError(
      code,
      payload?.message ?? `Request failed with status ${response.status}`,
      // The backend calls its field map `errors`; the UI calls it
      // `fields`. Translate here so components see one shape.
      payload?.errors ?? {},
      response.status,
    );
  }

  // The API envelope is { success, message, data, meta } — callers want data,
  // except paginated lists, which also need meta.
  if (envelope) {
    return { data: payload?.data ?? null, meta: payload?.meta ?? null };
  }

  return payload?.data ?? null;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),
};
