// Home page: cards for what the visitor can do, by role.

import { getSession, pageUrl } from "./shared/auth.js";
import { api } from "./shared/api.js";
import { isConfigured } from "./shared/config.js";
import { el, renderHeader, showMessage } from "./shared/ui.js";

renderHeader();

const session = getSession();
const role = session?.user.role;

if (session) {
  document.getElementById("greeting").textContent =
    `Welcome back, ${session.user.fullName}.`;
}

const notice = new URLSearchParams(location.search).get("notice");
if (notice === "not_allowed") {
  showMessage(document.getElementById("notice"), "error",
    "That page is only for officers.");
}

function card(title, text, path, linkText) {
  return el("section", { className: "card" }, [
    el("h2", { text: title }),
    el("p", { text }),
    el("a", { text: linkText, attrs: { href: pageUrl(path) } }),
  ]);
}

const cards = [];
if (!session) {
  cards.push(card("Join the club",
    "Send a membership request. An officer will review it.",
    "membership/join.html", "Request membership"));
  cards.push(card("Members",
    "Already approved? Sign in to see events and announcements.",
    "membership/login.html", "Sign in"));
}
if (session) {
  cards.push(card("Notifications", "Seats freed up, cancelled events and changes to your membership.",
    "membership/notifications.html", "Open notifications"));
}
cards.push(card("Events", "Upcoming and past club events.",
  "events/index.html", "View events"));
cards.push(card("Announcements", "News from the club officers.",
  "announcements/index.html", "View announcements"));
if (role === "officer") {
  cards.push(card("Membership requests", "Review people who want to join.",
    "membership/requests.html", "Review requests"));
  cards.push(card("Members", "Search members and change roles.",
    "membership/members.html", "Manage members"));
  cards.push(card("Audit log", "Approvals, role changes and sign-in events.",
    "membership/audit.html", "Open audit log"));
}
document.getElementById("cards").replaceChildren(...cards);

// Small connectivity check for the three services.
const status = document.getElementById("service-status");
const SERVICES = [["membership", "Membership"], ["events", "Events"], ["announcements", "Announcements"]];
const results = await Promise.all(SERVICES.map(async ([service, label]) => {
  if (!isConfigured(service)) return `${label}: not configured`;
  try {
    const health = await api(service, "/health", { auth: false });
    return `${label}: ${health.status}`;
  } catch {
    return `${label}: unreachable`;
  }
}));
status.textContent = `Services: ${results.join(" · ")}.`;
