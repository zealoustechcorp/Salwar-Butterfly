/**
 * The storefront search's helpers — product matches, spelling, and the
 * shopper's recent searches.
 *
 * Everything here runs in the shopper's browser, over data the page already
 * has or fetched once: a keystroke never asks the server anything. The grid's
 * own matching rule lives in lib/store/filters.js and is reused here rather
 * than copied, so a piece the dropdown offers is always one the grid would
 * show for the same words.
 *
 * Pure functions plus one module-level cache, no directive: this compiles
 * into whichever bundle imports it.
 */

import { searchText } from "@/lib/store/filters";

// --- the product index ------------------------------------------------------

/**
 * One request per visit, shared by every search box on the page (the header
 * renders up to three). Loaded on the first focus rather than with the page:
 * most visits never search, and they should not pay for the list.
 *
 * A failure clears the cache so the next focus tries again — a dropped
 * request on a train should not cost the rest of the visit its suggestions.
 */
let indexPromise = null;

export function loadSearchIndex() {
  if (!indexPromise) {
    indexPromise = fetch("/search-index")
      .then((response) => {
        if (!response.ok) throw new Error(`search index answered ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

/** The words in a query, lowercased — the same split the grid uses. */
export function queryWords(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The pieces that answer a query, best first: in stock before sold out, and
 * a name that starts with the first word before one that only mentions it.
 */
export function matchProducts(products, query, limit = 3) {
  const words = queryWords(query);
  if (!words.length || !products?.length) return [];

  const first = words[0];
  const rank = (p) =>
    (p.in_stock ? 0 : 2) + (p.name.toLowerCase().startsWith(first) ? 0 : 1);

  return products
    .filter((p) => {
      const haystack = searchText(p);
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

// --- spelling ---------------------------------------------------------------

/**
 * Every word the shop uses, from the suggestion labels and the pieces'
 * own search text. Short words are left out: at three letters nearly any
 * typo is one edit from some other word, and the "correction" would be noise.
 */
export function buildVocabulary(labels = [], products = []) {
  const words = new Set();
  const add = (text) => {
    for (const word of String(text ?? "").toLowerCase().split(/[^a-z0-9-]+/)) {
      if (word.length >= 4 && !/^\d+$/.test(word)) words.add(word);
    }
  };
  labels.forEach(add);
  products.forEach((p) => add(searchText(p)));
  return [...words];
}

/**
 * Optimal string alignment distance — Levenshtein plus swapped neighbours,
 * which is the commonest phone typo ("chnaderi"). Gives up early once the
 * distance passes `max`, so a long vocabulary stays cheap.
 */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/** One slip in a short word, two in a long one. */
const allowance = (word) => (word.length >= 7 ? 2 : 1);

/**
 * The query with each unknown word swapped for the nearest word the shop
 * uses, or null when nothing needed changing (or nothing was close enough).
 *
 * A word is left alone when it already appears inside a vocabulary word —
 * "chand" is half-typed, not misspelt — and when it is short or a number,
 * for the same reasons buildVocabulary() skips them.
 */
export function correctQuery(query, vocabulary) {
  const words = queryWords(query);
  if (!words.length || !vocabulary?.length) return null;

  let changed = false;
  const fixed = words.map((word) => {
    if (word.length < 4 || /^\d+$/.test(word)) return word;
    if (vocabulary.some((known) => known.includes(word))) return word;

    let best = null;
    let bestDistance = allowance(word) + 1;
    for (const known of vocabulary) {
      const d = distance(word, known, allowance(word));
      if (d < bestDistance) {
        best = known;
        bestDistance = d;
      }
    }
    if (best) {
      changed = true;
      return best;
    }
    return word;
  });

  return changed ? fixed.join(" ") : null;
}

// --- recent searches --------------------------------------------------------

/**
 * Kept in this browser only — they never reach the server, and a shopper on
 * a shared phone can clear them from the dropdown. Every access is guarded:
 * storage throws in some private windows, and a search box must not.
 */
const RECENT_KEY = "sb:recent-searches";
const MAX_RECENT = 5;

export function readRecent() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.label && item?.href).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

/** Most recent first; searching the same thing again moves it to the top. */
export function pushRecent(entry) {
  try {
    const next = [
      { label: entry.label, href: entry.href },
      ...readRecent().filter(
        (item) => item.label.toLowerCase() !== entry.label.toLowerCase(),
      ),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered this time; the search itself still happened.
  }
}

export function clearRecent() {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to do — there was nothing readable to clear.
  }
}
