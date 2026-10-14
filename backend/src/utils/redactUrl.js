// src/utils/redactUrl.js
//
// A request URL with its secrets taken out, for logs and error messages.
//
// The logger already scrubs sensitive *fields* (see SENSITIVE_FIELDS in
// logger.js), but a URL is one string, and a secret in its query string
// went straight past that: Meta's webhook handshake arrives as
//
//   GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
//
// and the request log, the 404 message and the error log all wrote the
// verify token out in full. Anyone with the log files could then answer
// Meta's handshake for a callback URL of their own choosing.
//
// The rule is by parameter name, not by route, so that the next
// integration to put a credential in a query string is caught without
// anybody remembering this file exists.

const REDACTED = "[REDACTED]";

/**
 * Whether a query parameter's value must not be logged.
 *
 * Lower-cased and with `.`, `-` and `_` removed before comparison, so
 * `hub.verify_token`, `verifyToken` and `VERIFY-TOKEN` are one rule.
 * Anything containing "token", "secret", "password", "signature" or
 * "apikey" is caught, plus the short names that are always credentials.
 */
const SENSITIVE_PARAM =
  /token|secret|password|passwd|signature|apikey|authorization|^otp$|^key$|^code$|^sig$/;

export const isSensitiveParam = (name) =>
  SENSITIVE_PARAM.test(String(name).toLowerCase().replace(/[._-]/g, ""));

/**
 * `url` with the value of every sensitive query parameter replaced.
 *
 * Works on the raw string rather than through URLSearchParams so that
 * the rest of the URL is logged byte for byte as it arrived — a
 * re-encoded query string is a different string when someone greps for
 * it later.
 */
export const redactUrl = (url) => {
  if (typeof url !== "string") return url;

  const q = url.indexOf("?");
  if (q === -1) return url;

  const hash = url.indexOf("#", q);
  const query = hash === -1 ? url.slice(q + 1) : url.slice(q + 1, hash);
  const tail = hash === -1 ? "" : url.slice(hash);

  const redacted = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const rawName = eq === -1 ? pair : pair.slice(0, eq);

      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, " "));
      } catch {
        // A malformed escape is still a name; test it as it came.
      }

      return eq !== -1 && isSensitiveParam(name) ? `${rawName}=${REDACTED}` : pair;
    })
    .join("&");

  return `${url.slice(0, q + 1)}${redacted}${tail}`;
};
