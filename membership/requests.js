// Officer page: list membership requests and approve or reject them.
//   GET   /membership-requests?status=
//   PATCH /membership-requests/:id  { decision }

import { api } from "../shared/api.js";
import { requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const session = requireRole(["officer"]);

if (session) {
  renderHeader();

  const list = document.getElementById("list");
  const message = document.getElementById("message");
  const tabs = [...document.querySelectorAll(".tab")];
  let status = "pending";

  const DECISION_ERRORS = {
    already_decided: "This request was already decided by another officer. The list has been refreshed.",
    request_not_found: "This request no longer exists. The list has been refreshed.",
    auth_update_failed:
      "The approval was saved, but the member's account could not be updated. Approve it again to finish.",
  };

  async function decide(request, decision, row) {
    const verb = decision === "approve" ? "Approve" : "Reject";
    if (!confirm(`${verb} the request from ${request.fullName}?`)) return;

    for (const button of row.querySelectorAll("button")) button.disabled = true;
    clearMessage(message);
    try {
      await api("membership", `/membership-requests/${encodeURIComponent(request.requestId)}`, {
        method: "PATCH",
        body: { decision },
      });
      showMessage(message, "success",
        `${request.fullName} was ${decision === "approve" ? "approved" : "rejected"}.`);
      row.remove();
      if (!list.querySelector("tbody tr")) await load();
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err, DECISION_ERRORS));
      if (err.code === "already_decided" || err.code === "request_not_found") {
        await load();
      } else {
        for (const button of row.querySelectorAll("button")) button.disabled = false;
      }
    }
  }

  function render(requests) {
    if (requests.length === 0) {
      list.replaceChildren(el("p", { className: "muted", text: `No ${status} requests.` }));
      return;
    }

    const decided = status !== "pending";
    const headings = ["Name", "Email", "Submitted"];
    if (decided) headings.push("Reviewed");
    else headings.push("Decision");

    const rows = requests.map((r) => {
      const row = el("tr", {}, [
        el("td", { text: r.fullName }),
        el("td", { text: r.email }),
        el("td", { text: formatDate(r.submittedAt) }),
      ]);
      if (decided) {
        row.append(el("td", { text: formatDate(r.reviewedAt) }));
      } else {
        const approve = el("button", { text: "Approve", className: "button", attrs: { type: "button" } });
        const reject = el("button", {
          text: "Reject", className: "button button-quiet", attrs: { type: "button" },
        });
        approve.addEventListener("click", () => decide(r, "approve", row));
        reject.addEventListener("click", () => decide(r, "reject", row));
        row.append(el("td", {}, [el("div", { className: "actions" }, [approve, reject])]));
      }
      return row;
    });

    list.replaceChildren(
      el("table", {}, [
        el("thead", {}, [el("tr", {}, headings.map((h) => el("th", { text: h, attrs: { scope: "col" } })))]),
        el("tbody", {}, rows),
      ]),
    );
  }

  async function load() {
    list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
    try {
      const data = await api("membership", "/membership-requests", { query: { status } });
      render(data.requests);
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      list.replaceChildren();
      showMessage(message, "error", errorText(err));
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      status = tab.dataset.status;
      for (const t of tabs) t.setAttribute("aria-pressed", String(t === tab));
      clearMessage(message);
      load();
    });
  }

  load();
}
