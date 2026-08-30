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
 */

import { readToken } from "@/lib/admin/session";

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
  const { method = "GET", body, token, signal, envelope = false } = options;

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
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal,
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
    throw new ApiError(
      payload?.code ?? "REQUEST_FAILED",
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
