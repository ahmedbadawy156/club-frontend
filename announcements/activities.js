// Past club activities (members and officers) and the officer form.
//   GET  /activities?limit=&before=
//   POST /activities  { eventId, eventTitle, eventDate, summary }

import { api } from "../shared/api.js";
import { requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const PAGE_SIZE = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const session = requireRole(["member", "officer"]);

const ERRORS = {
  activity_exists: "An activity is already recorded for this event.",
  validation_failed: "Check the fields: a valid event id, a title of 3 to 120 characters, a date that is not in the future, and at least 10 characters about what happened.",
};

if (session) {
  renderHeader();
  const list = document.getElementById("list");
  const message = document.getElementById("message");
  const more = document.getElementById("more");
  let nextBefore = null;

  function item(a) {
    return el("article", { className: "card post" }, [
      el("h2", { text: a.eventTitle }),
      el("p", {
        className: "post-meta",
        text: `Event on ${a.eventDate} · recorded by ${a.recordedByName || "an officer"} on ${formatDate(a.createdAt)}`,
      }),
      el("p", { className: "post-body", text: a.summary }),
    ]);
  }

  async function load(append) {
    if (!append) list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
    more.disabled = true;
    try {
      const data = await api("announcements", "/activities", {
        query: { limit: PAGE_SIZE, before: append ? nextBefore : undefined },
      });
      const nodes = data.activities.map(item);
      if (append) list.append(...nodes);
      else if (nodes.length) list.replaceChildren(...nodes);
      else list.replaceChildren(el("p", { className: "muted", text: "No activities recorded yet." }));
      nextBefore = data.nextBefore;
      more.hidden = !nextBefore;
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err, ERRORS));
    } finally {
      more.disabled = false;
    }
  }

  more.addEventListener("click", () => load(true));

  if (session.user.role === "officer") {
    const form = document.getElementById("record");
    form.hidden = false;
    form.eventDate.max = new Date().toISOString().slice(0, 10);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage(message);
      const body = {
        eventId: form.eventId.value.trim(),
        eventTitle: form.eventTitle.value.trim(),
        eventDate: form.eventDate.value,
        summary: form.summary.value.trim(),
      };
      if (!UUID_RE.test(body.eventId) || body.eventTitle.length < 3 || !body.eventDate || body.summary.length < 10) {
        showMessage(message, "error", ERRORS.validation_failed);
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await api("announcements", "/activities", { method: "POST", body });
        showMessage(message, "success", "Activity saved.");
        form.reset();
        await load(false);
      } catch (err) {
        if (!redirectOnAuthError(err)) showMessage(message, "error", errorText(err, ERRORS));
      } finally {
        button.disabled = false;
      }
    });
  }

  load(false);
}
