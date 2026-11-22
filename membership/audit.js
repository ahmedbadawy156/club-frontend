// Officer page: read the audit log, newest first, with "Load more".
//   GET /audit-log?type=&limit=&before=<logId>

import { api } from "../shared/api.js";
import { requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const PAGE_SIZE = 25;
const session = requireRole(["officer"]);

const EVENT_LABELS = {
  membership_approved: "Membership approved",
  membership_rejected: "Membership rejected",
  role_changed: "Role changed",
  login_failure: "Failed sign-in",
  account_locked: "Account locked",
};

function details(entry) {
  const m = entry.metadata ?? {};
  switch (entry.eventType) {
    case "role_changed":
      if (m.reason === "bootstrap") return "First officer created";
      return m.oldRole && m.newRole ? `${m.oldRole} → ${m.newRole}` : "";
    case "account_locked":
      return m.lockedUntil ? `Locked until ${formatDate(m.lockedUntil)}` : "";
    default:
      return "";
  }
}

const person = (p) => (p ? (p.fullName ?? "Removed member") : "System");

if (session) {
  renderHeader();

  const typeSelect = document.getElementById("type");
  const list = document.getElementById("list");
  const pager = document.getElementById("pager");
  const message = document.getElementById("message");
  let tbody = null;
  let lastLogId = null;

  function ensureTable() {
    if (tbody) return;
    tbody = el("tbody");
    list.replaceChildren(
      el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Time", "Event", "By", "Member", "Details"]
          .map((h) => el("th", { text: h, attrs: { scope: "col" } })))]),
        tbody,
      ]),
    );
  }

  async function loadPage(reset) {
    if (reset) {
      tbody = null;
      lastLogId = null;
      list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
      pager.replaceChildren();
    }
    try {
      const data = await api("membership", "/audit-log", {
        query: { type: typeSelect.value, limit: PAGE_SIZE, before: lastLogId },
      });
      const entries = data.entries;
      if (reset && entries.length === 0) {
        list.replaceChildren(el("p", { className: "muted", text: "No entries." }));
        return;
      }
      ensureTable();
      for (const e of entries) {
        tbody.append(el("tr", {}, [
          el("td", { text: formatDate(e.createdAt) }),
          el("td", { text: EVENT_LABELS[e.eventType] ?? e.eventType }),
          el("td", { text: person(e.actor) }),
          el("td", { text: e.target ? (e.target.fullName ?? "Removed member") : (e.metadata?.applicantName ?? "") }),
          el("td", { text: details(e) }),
        ]));
      }
      if (entries.length > 0) lastLogId = entries[entries.length - 1].logId;

      if (entries.length === PAGE_SIZE) {
        const more = el("button", {
          text: "Load more", className: "button button-quiet", attrs: { type: "button" },
        });
        more.addEventListener("click", () => {
          more.disabled = true;
          loadPage(false);
        });
        pager.replaceChildren(more);
      } else {
        pager.replaceChildren(el("span", { className: "muted", text: "End of the log." }));
      }
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err));
    }
  }

  typeSelect.addEventListener("change", () => {
    clearMessage(message);
    loadPage(true);
  });

  loadPage(true);
}
