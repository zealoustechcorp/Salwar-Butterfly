/**
 * PIN code lookup for the address forms (F-05.03, F-08.05).
 *
 * Reads `GET /storefront/getPincode/:pincode`, which answers from India
 * Post's directory with the city, the state and the post office areas
 * under that code. The forms use it to prefill, never to refuse: a code the
 * directory has not heard of is still a code the shop will ship to, so a
 * miss comes back as `{ ok: false, notFound: true }` and the shopper types
 * the rest themselves.
 *
 * Anonymous on purpose (`token: null`) — a guest at checkout needs this as
 * much as a signed-in shopper does, and the answer is the same for both.
 *
 * Answers are remembered for the life of the tab. A shopper who edits the
 * code, changes their mind and types it back should not wait twice, and the
 * API marks the answer cacheable for a day anyway.
 */

import { api, ApiError } from "@/lib/api/client";
import { PINCODE_REGEX } from "@/lib/validate";

const answers = new Map();

/**
 * @returns {Promise<
 *   | { ok: true, pincode: string, city: string, state: string, areas: string[] }
 *   | { ok: false, notFound: boolean, error: string }
 * >}
 */
export async function lookupPincode(pincode, { signal } = {}) {
  const code = String(pincode ?? "").trim();

  if (!PINCODE_REGEX.test(code)) {
    return { ok: false, notFound: false, error: "PIN code must be 6 digits" };
  }

  if (answers.has(code)) return answers.get(code);

  try {
    const data = await api.get(`/storefront/getPincode/${code}`, { token: null, signal });

    const answer = {
      ok: true,
      pincode: data.pincode,
      city: data.city ?? "",
      state: data.state ?? "",
      areas: Array.isArray(data.areas) ? data.areas : [],
    };

    answers.set(code, answer);
    return answer;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    const answer = { ok: false, notFound: error.status === 404, error: error.message };

    // A 404 is an answer and is kept; a server that was down is not, so
    // the next keystroke tries again.
    if (answer.notFound) answers.set(code, answer);
    return answer;
  }
}
