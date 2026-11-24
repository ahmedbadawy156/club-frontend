// Events list (members and officers) and the officer "create event" form.
//   GET  /events?period=upcoming|past&status=published|draft|cancelled
//   POST /events   { title, description, startsAt, location, capacity, isOutdoor, latitude?, longitude? }
// The Events backend checks the token and the officer role itself; the
// officer tools here are only shown to officers for convenience.

import { api } from "../shared/api.js";
import { pageUrl, requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const session = requireRole(["member", "officer"]);

const ERRORS = {
  validation_failed: "Check the fields: title 3 to 120 characters, a start time in the future, a location, capacity 1 to 1000, and coordinates for outdoor events.",
};

function eventBadges(e) {
  const badges = [];
  if (e.status !== "published") badges.push(el("span", { text: e.status, className: `badge badge-${e.status}` }));
  else if (e.seatsLeft === 0) badges.push(el("span", { text: "Full: waitlist open", className: "badge badge-full" }));
  return badges;
}

if (session) {
  renderHeader();
  const officer = session.user.role === "officer";
  const list = document.getElementById("list");
  const message = document.getElementById("message");
  let query = { period: "upcoming", status: "published" };

  function card(e) {
    const link = el("a", { text: e.title, attrs: { href: pageUrl(`events/event.html?id=${encodeURIComponent(e.id)}`) } });
    return el("article", { className: "card event-card" }, [
      el("h2", {}, [link, ...eventBadges(e)]),
      el("p", {
        className: "event-meta",
        text: `${formatDate(e.startsAt)} · ${e.location}${e.isOutdoor ? " · outdoor" : ""}`,
      }),
      el("p", {
        className: "seats",
        text: `${e.confirmedCount} of ${e.capacity} going${e.waitlistCount ? ` · ${e.waitlistCount} on the waitlist` : ""}`,
      }),
    ]);
  }

  async function load() {
    list.replaceChildren(el("p", { className: "muted", text: "Loading…" }));
    try {
      const data = await api("events", "/events", { query: { ...query, limit: 100 } });
      if (data.events.length === 0) {
        list.replaceChildren(el("p", { className: "muted", text: "No events here yet." }));
        return;
      }
      list.replaceChildren(...data.events.map(card));
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      list.replaceChildren();
      showMessage(message, "error", errorText(err, ERRORS));
    }
  }

  for (const tab of document.querySelectorAll("#views .tab")) {
    tab.addEventListener("click", () => {
      query = { period: tab.dataset.period, status: tab.dataset.status };
      for (const t of document.querySelectorAll("#views .tab")) t.setAttribute("aria-pressed", String(t === tab));
      clearMessage(message);
      load();
    });
  }

  if (officer) {
    for (const node of document.querySelectorAll(".officer-only")) node.hidden = false;
    const form = document.getElementById("create-form");
    const coords = form.querySelector(".coords");
    form.isOutdoor.addEventListener("change", () => { coords.hidden = !form.isOutdoor.checked; });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage(message);
      const start = new Date(form.startsAt.value);
      const body = {
        title: form.title.value.trim(),
        description: form.description.value.trim(),
        startsAt: Number.isNaN(start.getTime()) ? "" : start.toISOString(),
        location: form.location.value.trim(),
        capacity: Number(form.capacity.value),
        isOutdoor: form.isOutdoor.checked,
      };
      if (body.isOutdoor) {
        body.latitude = form.latitude.value === "" ? undefined : Number(form.latitude.value);
        body.longitude = form.longitude.value === "" ? undefined : Number(form.longitude.value);
      }
      if (!body.title || !body.startsAt || !body.location || !Number.isInteger(body.capacity)) {
        showMessage(message, "error", ERRORS.validation_failed);
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        const created = await api("events", "/events", { method: "POST", body });
        location.assign(pageUrl(`events/event.html?id=${encodeURIComponent(created.id)}&created=1`));
      } catch (err) {
        if (!redirectOnAuthError(err)) showMessage(message, "error", errorText(err, ERRORS));
        button.disabled = false;
      }
    });
  }

  load();
}
