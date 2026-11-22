// Session handling: keep the token from the Membership login, end the
// session when it expires, and guard pages by role.
//
// The token lives in sessionStorage (cleared when the tab closes) and lasts
// 15 minutes. There is no refresh token: after it expires the user signs in
// again. Any script on the page could read the token, which is why every
// page has a strict Content-Security-Policy and shows user text only with
// textContent.
//
// Role checks here only decide what to show. The backends enforce every
// permission on their own.

const STORAGE_KEY = "club.session";
const EXPIRY_MARGIN_SECONDS = 30;
const ROOT = new URL("../", import.meta.url);

// ---------- storage ----------

export function getSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (session && session.expiresAt - Math.floor(Date.now() / 1000) <= EXPIRY_MARGIN_SECONDS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Save the response of POST /api/auth/login.
export function saveLogin(login) {
  const session = {
    accessToken: login.accessToken,
    expiresAt: login.expiresAt,
    user: { id: login.user.id, fullName: login.user.fullName, role: login.user.role },
  };
  storeSession(session);
  return session;
}

// Update the role shown for this session (for example after an officer
// demotes themself). The next login confirms it from the server.
export function setSessionRole(role) {
  const session = getSession();
  if (!session) return;
  session.user.role = role;
  storeSession(session);
}

// The access token, or null when signed out or expired.
export async function getAccessToken() {
  return getSession()?.accessToken ?? null;
}

// Tokens cannot be revoked early; signing out forgets it in this tab, and it
// expires on its own within 15 minutes.
export async function signOut() {
  clearSession();
}

// ---------- navigation helpers ----------

// Absolute URL of a page given its path from the site root.
export function pageUrl(path) {
  return new URL(path, ROOT).href;
}

// Only allow redirects back to pages of this site.
export function safeNext(next) {
  if (!next) return pageUrl("index.html");
  try {
    const url = new URL(next, location.origin);
    if (url.origin !== location.origin) return pageUrl("index.html");
    return url.href;
  } catch {
    return pageUrl("index.html");
  }
}

// Send visitors without a session to the login page, and signed-in users
// without one of the roles to the home page. Returns the session.
export function requireRole(roles) {
  const session = getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(pageUrl(`membership/login.html?next=${next}`));
    return null;
  }
  if (roles && !roles.includes(session.user.role)) {
    location.replace(pageUrl("index.html?notice=not_allowed"));
    return null;
  }
  return session;
}
