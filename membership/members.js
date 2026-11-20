// Officer page: search members and change roles.
//   GET   /members?search=&status=&limit=&offset=
//   PATCH /members/:id/role  { role }

import { api } from "../shared/api.js";
import { pageUrl, requireRole, setSessionRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const PAGE_SIZE = 20;
const session = requireRole(["officer"]);

if (session) {
  renderHeader();

  const form = document.getElementById("search-form");
  const list = document.getElementById("list");
  const pager = document.getElementById("pager");
  const message = document.getElementById("message");
  let query = { search: "", status: "active" };
  let offset = 0;

  const ROLE_ERRORS = {
    last_officer: "This is the last officer. Make someone else an officer first.",
    target_not_active: "Only approved members can have their role changed.",
    user_not_found: "This member no longer exists. The list has been refreshed.",
    auth_update_failed:
      "The role was saved, but the account could not be updated. Try the same change again to finish.",
  };

  async function changeRole(member, role, buttons) {
    const self = member.userId === session.user.id;
    const text = role === "officer"
      ? `Make ${member.fullName} an officer?`
      : self
        ? "Remove your own officer role? You will lose access to officer pages."
        : `Make ${member.fullName} a regular member?`;
    if (!confirm(text)) return;

    for (const b of buttons) b.disabled = true;
    clearMessage(message);
    try {
      const result = await api("membership", `/members/${encodeURIComponent(member.userId)}/role`, {
        method: "PATCH",
        body: { role },
      });
      if (self && result.role === "member") {
        setSessionRole("member");
        location.assign(pageUrl("index.html"));
        return;
      }
      showMessage(message, "success", result.changed
        ? `${member.fullName} is now ${result.role === "officer" ? "an officer" : "a member"}.`
        : `${member.fullName} already had that role.`);
      await load();
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err, ROLE_ERRORS));
      if (err.code === "user_not_found") await load();
      else for (const b of buttons) b.disabled = false;
    }
  }

  function roleButton(member) {
    if (!member.active) return el("span", { className: "muted", text: "Not approved" });
    const toOfficer = member.role !== "officer";
    const button = el("button", {
      text: toOfficer ? "Make officer" : "Make member",
      className: toOfficer ? "button" : "button button-quiet",
      attrs: { type: "button" },
    });
    button.addEventListener("click", () =>
      changeRole(member, toOfficer ? "officer" : "member", [button]));
    return el("div", { className: "actions" }, [button]);
  }

  function render(data) {
    const { members, total } = data;
    if (members.length === 0) {
      list.replaceChildren(el("p", { className: "muted", text: "No members match." }));
      pager.replaceChildren();
      return;
    }

    const rows = members.map((m) =>
      el("tr", {}, [
        el("td", { text: m.userId === session.user.id ? `${m.fullName} (you)` : m.fullName }),
        el("td", { text: m.email }),
        el("td", {}, [el("span", {
          text: m.active ? m.role : "inactive",
          className: `status status-${m.active ? m.role : "inactive"}`,
        })]),
        el("td", { text: formatDate(m.createdAt) }),
        el("td", {}, [roleButton(m)]),
      ]));

    list.replaceChildren(
      el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Name", "Email", "Role", "Joined", "Change role"]
          .map((h) => el("th", { text: h, attrs: { scope: "col" } })))]),
        el("tbody", {}, rows),
      ]),
    );

    const from = offset + 1;
    const to = offset + members.length;
    const prev = el("button", {
      text: "Previous", className: "button button-quiet",
      attrs: { type: "button", disabled: offset === 0 },
    });
    const next = el("button", {
      text: "Next", className: "button button-quiet",
      attrs: { type: "button", disabled: to >= total },
    });
    prev.addEventListener("click", () => { offset = Math.max(0, offset - PAGE_SIZE); load(); });
    next.addEventListener("click", () => { offset += PAGE_SIZE; load(); });
    pager.replaceChildren(prev, el("span", { className: "muted", text: `${from}–${to} of ${total}` }), next);
  }

  async function load() {
    list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
    try {
      const data = await api("membership", "/members", {
        query: { ...query, limit: PAGE_SIZE, offset },
      });
      render(data);
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      list.replaceChildren();
      pager.replaceChildren();
      showMessage(message, "error", errorText(err, {
        validation_failed: "Search text must be 100 characters or fewer.",
      }));
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage(message);
    query = { search: form.search.value.trim(), status: form.status.value };
    offset = 0;
    load();
  });

  load();
}
