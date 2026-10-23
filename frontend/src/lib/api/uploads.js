/**
 * Uploads in flight, for the dialog that tells the shop not to leave.
 *
 * The client registers every multipart request carrying a file here and
 * reports its bytes as they go. Screens do not have to opt in: a gallery
 * upload, a banner, a category image and the bulk screen's parallel
 * batches all show up the same way, and the bulk screen's batches add
 * together into one bar rather than racing each other.
 *
 * A plain store read with useSyncExternalStore, so a React tree can
 * watch it without a provider.
 */

const active = new Map();
let nextId = 0;

const IDLE = Object.freeze({ count: 0, loaded: 0, total: 0, processing: false });
let snapshot = IDLE;

const listeners = new Set();

function publish() {
  if (active.size === 0) {
    snapshot = IDLE;
  } else {
    let loaded = 0;
    let total = 0;

    for (const entry of active.values()) {
      loaded += entry.loaded;
      total += entry.total;
    }

    snapshot = {
      count: active.size,
      loaded,
      total,
      // Every byte is on the wire but no response yet: the API is
      // storing the files. Worth its own wording, because a bar parked
      // at 100% looks hung.
      processing: total > 0 && loaded >= total,
    };
  }

  listeners.forEach((listener) => listener());
}

/**
 * Registers one upload. Call `progress` as bytes go out and `end` when
 * the request settles either way.
 */
export function beginUpload(total = 0) {
  const id = ++nextId;

  active.set(id, { loaded: 0, total });
  publish();

  return {
    progress(loaded, nextTotal) {
      const entry = active.get(id);
      if (!entry) return;

      entry.loaded = loaded;
      if (nextTotal) entry.total = nextTotal;
      publish();
    },
    end() {
      if (active.delete(id)) publish();
    },
  };
}

export function subscribeUploads(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readUploads() {
  return snapshot;
}

/** The server render never has an upload in flight. */
export function readUploadsOnServer() {
  return IDLE;
}

/** Whether a body is worth tracking: a multipart form carrying a file. */
export function carriesFile(body) {
  if (typeof FormData === "undefined" || !(body instanceof FormData)) {
    return false;
  }

  for (const value of body.values()) {
    if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  }

  return false;
}
