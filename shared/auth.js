// Session handling: store tokens from the Membership login, refresh them
// before they expire, and guard pages by role.
//
// Tokens live in sessionStorage (cleared when the tab closes). Any script
// on the page could read them, which is why every page has a strict
// Content-Security-Policy and shows user text only with textContent.
//
// Role checks here only decide what to show. The backends enforce every
// permission on their own.

import { config } from "./config.js";

const STORAGE_KEY = "club.session";
const REFRESH_MARGIN_SECONDS = 60;
const ROOT = new URL("../", import.meta.url);

// ---------- token helpers ----------

// Decode a JWT payload for display decisions only (no verification).
export function decodeToken(token) {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function roleFromToken(token) {
  const role = decodeToken(token)?.app_metadata?.role;
  return role === "officer" || role === "member" ? role : null;
}

// ---------- storage ----------

export function getSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
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

// Save the response of POST /auth/login.
export function saveLogin(login) {
  const session = {
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    expiresAt: login.expiresAt,
    user: {
      id: login.user.id,
      fullName: login.user.fullName,
      role: roleFromToken(login.accessToken) ?? login.user.role,
    },
  };
  storeSession(session);
  return session;
}

// ---------- refresh ----------

let refreshing = null; // one refresh at a time (refresh tokens rotate)

async function refresh(session) {
  const { authUrl, publishableKey } = config.membership;
  const res = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!res.ok) throw new Error(`refresh failed (${res.status})`);
  const data = await res.json();
  const updated = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    user: {
      ...session.user,
      role: roleFromToken(data.access_token) ?? session.user.role,
    },
  };
  storeSession(updated);
  return updated;
}

// A valid access token, refreshed if it expires within a minute.
// Returns null (and clears the session) if refreshing fails.
export async function getAccessToken() {
  const session = getSession();
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - now > REFRESH_MARGIN_SECONDS) {
    return session.accessToken;
  }
  try {
    refreshing ??= refresh(session).finally(() => {
      refreshing = null;
    });
    return (await refreshing).accessToken;
  } catch {
    clearSession();
    return null;
  }
}

// ---------- sign-out ----------

export async function signOut() {
  const session = getSession();
  clearSession();
  if (!session) return;
  // Revoke the refresh token on the server; ignore network errors.
  try {
    const { authUrl, publishableKey } = config.membership;
    await fetch(`${authUrl}/logout?scope=local`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
  } catch {
    // The local session is already gone.
  }
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
