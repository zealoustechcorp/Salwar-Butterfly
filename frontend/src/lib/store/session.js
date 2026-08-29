/**
 * Placeholder customer accounts, held in this browser.
 *
 * There is no auth API behind the storefront yet — `backend/src/routes` is
 * health checks only — so an account here is a record in localStorage and a
 * password check that runs on the client. **This is not security.** Anyone with
 * the devtools open can read every account on their own machine. It exists so
 * the storefront can have a real signed-in/signed-out shape now, and so that
 * when `POST /auth/login` lands only `createAccount` and `verifyAccount` change.
 *
 * The one thing it does do properly is never write a plaintext password: only a
 * salted digest is stored, so a shared machine does not leak a password the
 * shopper probably reuses elsewhere.
 *
 * Kept framework-free and outside the components so that both <AuthProvider>
 * and <StoreProvider> can read the session without importing each other.
 */

const SESSION_KEY = "sb.session";
const USERS_KEY = "sb.users";

// Fixed, and in the source — a client-side salt cannot be a secret. It only
// stops a stored digest from matching a rainbow table built for a bare
// SHA-256(password).
const SALT = "salwar-butterfly.v1";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MIN_PASSWORD = 6;

// --- localStorage plumbing --------------------------------------------------

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback; // private mode, quota, or a stale shape — start clean
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is a convenience here, never a correctness dependency */
  }
}

// --- session ----------------------------------------------------------------

/**
 * The signed-in shopper, or null. Safe to call during a client render; returns
 * null on the server, where there is no localStorage.
 */
export function readSession() {
  if (typeof window === "undefined") return null;
  const session = readJson(SESSION_KEY, null);
  // A half-written or hand-edited record is treated as signed out rather than
  // being allowed to produce a user with no id to key the wishlist by.
  return session && typeof session.id === "string" && session.id ? session : null;
}

export function writeSession(user) {
  writeJson(SESSION_KEY, user);
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* see writeJson */
  }
}

// --- accounts ---------------------------------------------------------------

function readUsers() {
  const users = readJson(USERS_KEY, []);
  return Array.isArray(users) ? users : [];
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function digest(email, password) {
  const input = `${SALT}:${email}:${password}`;
  try {
    const bytes = new TextEncoder().encode(input);
    const hashed = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hashed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // `crypto.subtle` only exists in a secure context, so plain http on a LAN
    // IP (a phone testing the dev server) lands here. Neither branch is real
    // security; both keep the plaintext out of storage, which is the point.
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
    return `djb2:${hash.toString(16)}`;
  }
}

/** The shape handed to the rest of the app — never carries the digest. */
function publicUser(record) {
  return { id: record.id, name: record.name, email: record.email };
}

/**
 * Both flows answer `{ ok: true, user }` or `{ ok: false, field, error }`, so
 * the modal can put the message under the field that caused it.
 */
export async function createAccount({ name, email, password }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = normaliseEmail(email);

  if (cleanName.length < 2) {
    return { ok: false, field: "name", error: "Tell us what to call you." };
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    return { ok: false, field: "email", error: "That does not look like an email address." };
  }
  if (String(password || "").length < MIN_PASSWORD) {
    return {
      ok: false,
      field: "password",
      error: `Use at least ${MIN_PASSWORD} characters.`,
    };
  }

  const users = readUsers();
  if (users.some((user) => user.email === cleanEmail)) {
    return { ok: false, field: "email", error: "That email already has an account. Sign in instead." };
  }

  const record = {
    id: newId(),
    name: cleanName,
    email: cleanEmail,
    password_digest: await digest(cleanEmail, password),
    created_at: new Date().toISOString(),
  };
  writeJson(USERS_KEY, [...users, record]);

  return { ok: true, user: publicUser(record) };
}

export async function verifyAccount({ email, password }) {
  const cleanEmail = normaliseEmail(email);

  if (!EMAIL_RE.test(cleanEmail)) {
    return { ok: false, field: "email", error: "That does not look like an email address." };
  }

  const record = readUsers().find((user) => user.email === cleanEmail);
  // Deliberately the same message whether the email is unknown or the password
  // is wrong: a sign-in form should not confirm who has an account here.
  const wrong = { ok: false, field: "password", error: "Email or password is not right." };
  if (!record) return wrong;
  if (record.password_digest !== (await digest(cleanEmail, password))) return wrong;

  return { ok: true, user: publicUser(record) };
}
