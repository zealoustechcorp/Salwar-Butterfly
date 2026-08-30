/**
 * The one place the frontend talks to the Express API.
 *
 * Every admin module goes through here — admin authentication,
 * categories and products. The storefront still renders from the
 * static catalogue in src/lib/store/catalogue.js and is the last
 * thing left to move.
 *
 * Failures arrive as a thrown `ApiError` carrying
 * { code, message, fields, status }.
 */

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
 * @param {string} [options.token]  bearer token, when the route needs one
 * @param {boolean} [options.envelope]  resolve to { data, meta } instead of
 *                                      just data — for paginated lists
 * @param {AbortSignal} [options.signal]
 */
export async function request(path, options = {}) {
  const { method = "GET", body, token, signal, envelope = false } = options;

  const headers = {};

  // A FormData body must set its own Content-Type: the browser appends the
  // multipart boundary, and naming the header here would strip it.
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
