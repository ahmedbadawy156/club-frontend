// Safe display helpers. User-supplied text is only ever set with
// textContent, never innerHTML, so it cannot run as script.

import { getSession, pageUrl, signOut } from "./auth.js";
import { api } from "./api.js";
import { isConfigured } from "./config.js";

// Create an element: el("p", { text: "Hi", className: "note" }, [children])
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.className) node.className = options.className;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

// Show a message in a container: kind is "info", "success" or "error".
export function showMessage(container, kind, text) {
  container.replaceChildren(
    el("p", {
      text,
      className: `message message-${kind}`,
      attrs: { role: kind === "error" ? "alert" : "status" },
    }),
  );
}

export function clearMessage(container) {
  container.replaceChildren();
}

// Friendly text for ApiError codes shared by all services.
const COMMON_MESSAGES = {
  network_error: "Cannot reach the server. Check your connection and try again.",
  service_not_configured: "This service is not configured yet.",
  session_expired: "Your session has ended. Please sign in again.",
  sign_in_required: "Please sign in.",
  officer_only: "Only officers can do this.",
  validation_failed: "Some fields are not valid.",
  rate_limited: "Too many attempts. Please wait and try again later.",
  body_too_large: "The request is too large.",
  internal_error: "Something went wrong on the server. Please try again.",
};

export function errorText(err, overrides = {}) {
  const code = err?.code;
  if (code && overrides[code]) return overrides[code];
  if (code && COMMON_MESSAGES[code]) return COMMON_MESSAGES[code];
  if (err?.status === 401) return COMMON_MESSAGES.session_expired;
  if (err?.status === 403) return "You are not allowed to do this.";
  return "Something went wrong. Please try again.";
}

// For pages behind sign-in: send the user away when the server says the
// session is gone (401) or the role is not enough (403 officer_only).
// Returns true if it redirected.
export function redirectOnAuthError(err) {
  if (err?.status === 401) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.assign(pageUrl(`membership/login.html?next=${next}`));
    return true;
  }
  if (err?.status === 403 && err.code === "officer_only") {
    location.assign(pageUrl("index.html?notice=not_allowed"));
    return true;
  }
  return false;
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

// Unread count next to the Notifications link (Membership service). Quietly
// does nothing when the service cannot be reached.
export async function refreshUnreadCount(link = document.querySelector(".notices-link")) {
  if (!link || !isConfigured("membership")) return;
  try {
    const data = await api("membership", "/notifications", { query: { limit: 1 } });
    link.querySelector(".notices-count")?.remove();
    if (data.unreadCount > 0) {
      link.append(el("span", {
        text: data.unreadCount > 99 ? "99+" : String(data.unreadCount),
        className: "notices-count",
        attrs: { "aria-label": `${data.unreadCount} unread` },
      }));
    }
  } catch {
    // The header still works without the count.
  }
}

// Site header with links for the current role and a sign-out button.
export function renderHeader() {
  const session = getSession();
  const role = session?.user.role;

  const link = (path, text) => el("a", { text, attrs: { href: pageUrl(path) } });
  const links = [link("index.html", "Home")];
  links.push(link("events/index.html", "Events"));
  links.push(link("announcements/index.html", "Announcements"));
  if (role === "officer") {
    links.push(link("membership/requests.html", "Requests"));
    links.push(link("membership/members.html", "Members"));
    links.push(link("membership/audit.html", "Audit log"));
  }

  const account = el("div", { className: "account" });
  if (session) {
    const signOutButton = el("button", {
      text: "Sign out",
      className: "button button-quiet",
      attrs: { type: "button" },
    });
    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      await signOut();
      location.assign(pageUrl("index.html"));
    });
    const bell = el("a", {
      text: "Notifications",
      className: "notices-link",
      attrs: { href: pageUrl("membership/notifications.html") },
    });
    account.append(
      bell,
      el("span", {
        text: `${session.user.fullName} (${role})`,
        className: "account-name",
      }),
      signOutButton,
    );
    refreshUnreadCount(bell);
  } else {
    account.append(
      link("membership/join.html", "Join"),
      el("a", {
        text: "Sign in",
        className: "button",
        attrs: { href: pageUrl("membership/login.html") },
      }),
    );
  }

  const header = el("header", { className: "site-header" }, [
    el("a", {
      text: "Campus Club",
      className: "brand",
      attrs: { href: pageUrl("index.html") },
    }),
    el("nav", { attrs: { "aria-label": "Main" } }, links),
    account,
  ]);

  document.body.prepend(header);
}
