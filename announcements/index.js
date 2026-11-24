// Announcements feed (members and officers) and the officer editor.
//   GET   /announcements?view=current|scheduled|expired|archived
//   POST  /announcements          { title, body, pinned, publishAt?, expiresAt? }
//   PATCH /announcements/:id      { version, ...changes } or { version, status: "archived" }
// The Announcements backend checks the token and the officer role itself;
// the officer tools here are only shown to officers for convenience.

import { api } from "../shared/api.js";
import { requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const session = requireRole(["member", "officer"]);

const ERRORS = {
  pin_limit_reached: "At most 3 announcements can be pinned. Unpin one first.",
  version_conflict: "Someone else changed this announcement. The list has been refreshed; try again.",
  announcement_archived: "This announcement is archived and can no longer change.",
  already_published: "It is already published, so the publish time cannot change.",
  announcement_expired: "An expired announcement cannot be pinned. Give it a new expiry first.",
  announcement_not_found: "This announcement no longer exists.",
  validation_failed: "Check the fields: title 3 to 120 characters, text up to 2000, dates in the future and expiry after publishing.",
};

// "2026-12-01T18:00" from <input type="datetime-local"> -> ISO with time zone.
function toIso(local) {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
// ISO -> value for <input type="datetime-local"> in local time.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

if (session) {
  renderHeader();
  const officer = session.user.role === "officer";
  const list = document.getElementById("list");
  const message = document.getElementById("message");
  let view = "current";
  let editing = null; // the announcement being edited, or null

  function badge(text, kind) {
    return el("span", { text, className: `badge badge-${kind}` });
  }

  async function patch(a, changes, okText) {
    clearMessage(message);
    try {
      await api("announcements", `/announcements/${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        body: { version: a.version, ...changes },
      });
      showMessage(message, "success", okText);
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err, ERRORS));
    }
    await load();
  }

  function officerActions(a) {
    if (!officer || a.state === "archived") return null;
    const pin = el("button", {
      text: a.pinned ? "Unpin" : "Pin",
      className: "button button-quiet",
      attrs: { type: "button" },
    });
    pin.addEventListener("click", () => {
      pin.disabled = true;
      patch(a, { pinned: !a.pinned }, a.pinned ? "Unpinned." : "Pinned to the top.");
    });
    const edit = el("button", { text: "Edit", className: "button button-quiet", attrs: { type: "button" } });
    edit.addEventListener("click", () => startEdit(a));
    const archive = el("button", { text: "Archive", className: "button button-danger", attrs: { type: "button" } });
    archive.addEventListener("click", () => {
      if (!confirm(`Archive "${a.title}"? Members will no longer see it, and it cannot be edited again.`)) return;
      archive.disabled = true;
      patch(a, { status: "archived" }, "Archived. It is kept in the Archived list.");
    });
    return el("div", { className: "actions" }, [pin, edit, archive]);
  }

  function post(a) {
    const title = el("h2", { text: a.title });
    if (a.pinned) title.append(badge("Pinned", "pinned"));
    if (a.state !== "current") title.append(badge(a.state, a.state));

    const meta = [`By ${a.authorName || "an officer"}`, a.state === "scheduled"
      ? `publishes ${formatDate(a.publishAt)}`
      : `published ${formatDate(a.publishAt)}`];
    if (a.expiresAt) meta.push(`${a.state === "expired" ? "expired" : "expires"} ${formatDate(a.expiresAt)}`);

    return el("article", { className: `card post${a.pinned ? " post-pinned" : ""}` }, [
      title,
      el("p", { className: "post-meta", text: meta.join(" · ") }),
      el("p", { className: "post-body", text: a.body }),
      officerActions(a),
    ]);
  }

  async function load() {
    list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
    try {
      const data = await api("announcements", "/announcements", { query: { view, limit: 100 } });
      if (data.announcements.length === 0) {
        const empty = { current: "No announcements right now.", scheduled: "Nothing scheduled.",
          expired: "No expired announcements.", archived: "Nothing archived." };
        list.replaceChildren(el("p", { className: "muted", text: empty[view] }));
        return;
      }
      list.replaceChildren(...data.announcements.map(post));
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      list.replaceChildren();
      showMessage(message, "error", errorText(err, ERRORS));
    }
  }

  // ---------- officer tools ----------
  const form = document.getElementById("editor");
  const submit = document.getElementById("editor-submit");
  const cancel = document.getElementById("editor-cancel");
  const editorTitle = document.getElementById("editor-title");

  function resetEditor() {
    editing = null;
    form.reset();
    form.publishAt.disabled = false;
    editorTitle.textContent = "New announcement";
    submit.textContent = "Publish";
    cancel.hidden = true;
  }

  function startEdit(a) {
    editing = a;
    form.title.value = a.title;
    form.body.value = a.body;
    form.pinned.checked = a.pinned;
    form.publishAt.value = toLocalInput(a.publishAt);
    form.publishAt.disabled = a.state !== "scheduled";
    form.expiresAt.value = toLocalInput(a.expiresAt);
    editorTitle.textContent = `Edit: ${a.title}`;
    submit.textContent = "Save changes";
    cancel.hidden = false;
    form.scrollIntoView({ behavior: "smooth" });
  }

  if (officer) {
    document.getElementById("officer-tools").hidden = false;

    for (const tab of document.querySelectorAll("#views .tab")) {
      tab.addEventListener("click", () => {
        view = tab.dataset.view;
        for (const t of document.querySelectorAll("#views .tab")) {
          t.setAttribute("aria-pressed", String(t === tab));
        }
        clearMessage(message);
        load();
      });
    }

    cancel.addEventListener("click", resetEditor);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage(message);
      const title = form.title.value.trim();
      const text = form.body.value.trim();
      const publishAt = toIso(form.publishAt.value);
      const expiresAt = toIso(form.expiresAt.value);
      if (title.length < 3 || title.length > 120 || text.length < 1 || publishAt === null || expiresAt === null) {
        showMessage(message, "error", ERRORS.validation_failed);
        return;
      }

      submit.disabled = true;
      try {
        if (!editing) {
          const body = { title, body: text, pinned: form.pinned.checked };
          if (publishAt) body.publishAt = publishAt;
          if (expiresAt) body.expiresAt = expiresAt;
          const created = await api("announcements", "/announcements", { method: "POST", body });
          showMessage(message, "success", created.state === "scheduled"
            ? `Scheduled for ${formatDate(created.publishAt)}.`
            : "Published.");
        } else {
          // Send only what changed, with the version this page last saw.
          const changes = {};
          if (title !== editing.title) changes.title = title;
          if (text !== editing.body) changes.body = text;
          if (form.pinned.checked !== editing.pinned) changes.pinned = form.pinned.checked;
          if (editing.state === "scheduled" && publishAt && publishAt.slice(0, 16) !== editing.publishAt.slice(0, 16)) {
            changes.publishAt = publishAt;
          }
          const oldExp = editing.expiresAt ? editing.expiresAt.slice(0, 16) : "";
          const newExp = expiresAt ? expiresAt.slice(0, 16) : "";
          if (oldExp !== newExp) changes.expiresAt = expiresAt || null;
          if (Object.keys(changes).length === 0) {
            showMessage(message, "info", "Nothing changed.");
            submit.disabled = false;
            return;
          }
          await api("announcements", `/announcements/${encodeURIComponent(editing.id)}`, {
            method: "PATCH",
            body: { version: editing.version, ...changes },
          });
          showMessage(message, "success", "Saved.");
        }
        resetEditor();
        await load();
      } catch (err) {
        if (!redirectOnAuthError(err)) {
          showMessage(message, "error", errorText(err, ERRORS));
          if (err.code === "version_conflict" || err.code === "announcement_archived") {
            resetEditor();
            await load();
          }
        }
      } finally {
        submit.disabled = false;
      }
    });
  }

  load();
}
