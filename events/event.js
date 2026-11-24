// One event: details, RSVP or cancel, weather, and officer tools.
//   GET    /events/:id                 details + my RSVP
//   POST   /events/:id/rsvps           RSVP (confirmed or waitlisted)
//   DELETE /events/:id/rsvps/me        cancel my RSVP
//   GET    /events/:id/weather         forecast (public, cached by the service)
//   PATCH  /events/:id                 officer: edit, or { status }
//   GET    /events/:id/rsvps           officer: sign-ups and waitlist

import { api } from "../shared/api.js";
import { pageUrl, requireRole } from "../shared/auth.js";
import {
  clearMessage, el, errorText, formatDate, redirectOnAuthError, renderHeader, showMessage,
} from "../shared/ui.js";

const session = requireRole(["member", "officer"]);

const ERRORS = {
  event_not_found: "This event does not exist (or is not published yet).",
  event_not_open: "RSVPs are closed for this event.",
  already_rsvped: "You already have an RSVP for this event.",
  rsvp_not_found: "You have no RSVP for this event.",
  event_started: "The event has already started, so it can no longer change.",
  event_cancelled: "This event is cancelled and can no longer change.",
  invalid_status_change: "That status change is not allowed.",
  capacity_below_confirmed: "Capacity cannot be lower than the number of confirmed seats.",
  busy_try_again: "Many people are signing up right now. Please try again.",
  conflict: "Someone else changed this event at the same moment. Reload and try again.",
  validation_failed: "Check the fields: title 3 to 120 characters, a start time in the future, a location, capacity 1 to 1000, and coordinates for outdoor events.",
  weather_unavailable: "The weather service is not answering right now.",
};

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const id = new URLSearchParams(location.search).get("id") || "";

if (session) {
  renderHeader();
  const officer = session.user.role === "officer";
  const message = document.getElementById("message");
  let current = null;

  function badge(text, kind) {
    return el("span", { text, className: `badge badge-${kind}` });
  }

  function renderRsvp(e) {
    const box = document.getElementById("rsvp");
    const started = Date.parse(e.startsAt) <= Date.now();
    const parts = [];
    if (e.myRsvp) {
      parts.push(el("p", {}, [
        el("span", { text: "Your RSVP: " }),
        badge(e.myRsvp.status === "confirmed" ? "Going" : `Waitlist #${e.myRsvp.position}`, e.myRsvp.status),
      ]));
    }
    if (e.status === "published" && !started) {
      if (e.myRsvp) {
        const cancel = el("button", { text: "Cancel my RSVP", className: "button button-quiet", attrs: { type: "button" } });
        cancel.addEventListener("click", async () => {
          if (!confirm("Cancel your RSVP? If the event is full, your seat goes to the next person on the waitlist.")) return;
          cancel.disabled = true;
          await act(() => api("events", `/events/${encodeURIComponent(id)}/rsvps/me`, { method: "DELETE" }), "Your RSVP is cancelled.");
        });
        parts.push(cancel);
      } else {
        const full = e.seatsLeft === 0;
        const join = el("button", { text: full ? "Join the waitlist" : "RSVP", className: "button", attrs: { type: "button" } });
        join.addEventListener("click", async () => {
          join.disabled = true;
          await act(async () => {
            const r = await api("events", `/events/${encodeURIComponent(id)}/rsvps`, { method: "POST" });
            return r;
          }, null, (r) => (r.status === "confirmed" ? "You're going!" : `The event is full. You are number ${r.position} on the waitlist.`));
        });
        parts.push(join);
      }
    } else if (e.status === "cancelled") {
      parts.push(el("p", { className: "muted", text: "This event was cancelled." }));
    } else if (started) {
      parts.push(el("p", { className: "muted", text: "This event has already started." }));
    }
    box.replaceChildren(...parts);
  }

  async function loadWeather(e) {
    const card = document.getElementById("weather-card");
    const box = document.getElementById("weather");
    if (!e.isOutdoor || e.status !== "published") { card.hidden = true; return; }
    card.hidden = false;
    box.replaceChildren(el("p", { className: "muted", text: "Loading forecast…" }));
    try {
      const w = await api("events", `/events/${encodeURIComponent(id)}/weather`, { auth: false });
      if (!w.available) {
        const why = { too_far_ahead: "Forecasts are available about two weeks before the event.",
          event_in_past: "The event is over.", not_outdoor: "Indoor event." };
        box.replaceChildren(el("p", { className: "muted", text: `No forecast yet. ${why[w.reason] || ""}` }));
        return;
      }
      const f = w.forecast;
      box.replaceChildren(
        el("div", { className: "weather" }, [
          el("span", { className: "temp", text: `${Math.round(f.temperatureC)}°C` }),
          el("span", { text: f.description || "" }),
          el("span", { text: f.precipitationProbability === null ? "" : `Rain chance ${f.precipitationProbability}%` }),
          el("span", { text: f.windSpeedKmh === null ? "" : `Wind ${Math.round(f.windSpeedKmh)} km/h` }),
        ]),
        el("p", {
          className: "hint",
          text: `Forecast for ${formatDate(f.time)} from Open-Meteo${w.cached ? " (cached)" : ""}${w.stale ? ", may be out of date" : ""}.`,
        }),
      );
    } catch (err) {
      box.replaceChildren(el("p", { className: "muted", text: errorText(err, ERRORS) }));
    }
  }

  function renderOfficer(e) {
    const started = Date.parse(e.startsAt) <= Date.now();
    const actions = document.getElementById("status-actions");
    const buttons = [];
    const statusButton = (text, status, kind, confirmText, done) => {
      const b = el("button", { text, className: `button ${kind}`, attrs: { type: "button" } });
      b.addEventListener("click", async () => {
        if (confirmText && !confirm(confirmText)) return;
        b.disabled = true;
        await act(() => api("events", `/events/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }), done);
      });
      return b;
    };
    if (!started && e.status === "draft") buttons.push(statusButton("Publish", "published", "", null, "Published. Members can see it and RSVP."));
    if (!started && e.status !== "cancelled") {
      buttons.push(statusButton("Cancel event", "cancelled", "button-danger",
        "Cancel this event? Members will see it as cancelled. This cannot be undone.", "The event is cancelled."));
    }
    if (started && e.status === "published") {
      const q = new URLSearchParams({ eventId: e.id, eventTitle: e.title, eventDate: e.startsAt.slice(0, 10) });
      buttons.push(el("a", { text: "Record what happened (past activity)", className: "button", attrs: { href: pageUrl(`announcements/activities.html?${q}`) } }));
    }
    if (buttons.length === 0) buttons.push(el("span", { className: "muted", text: "No actions: the event is over or cancelled." }));
    actions.replaceChildren(...buttons);

    const edit = document.getElementById("edit");
    edit.hidden = started || e.status === "cancelled";
    const form = document.getElementById("edit-form");
    form.title.value = e.title;
    form.description.value = e.description;
    form.startsAt.value = toLocalInput(e.startsAt);
    form.location.value = e.location;
    form.capacity.value = e.capacity;
    form.isOutdoor.checked = e.isOutdoor;
    form.latitude.value = e.latitude ?? "";
    form.longitude.value = e.longitude ?? "";
  }

  async function loadSignups() {
    const box = document.getElementById("signups");
    try {
      const s = await api("events", `/events/${encodeURIComponent(id)}/rsvps`);
      const confirmed = s.confirmed.length
        ? el("ol", { className: "signups" }, s.confirmed.map((r) => el("li", { text: `${r.displayName}${r.promoted ? " (from waitlist)" : ""}` })))
        : el("p", { className: "muted", text: "Nobody yet." });
      const waitlist = s.waitlist.length
        ? el("ol", { className: "signups" }, s.waitlist.map((r) => el("li", { text: r.displayName })))
        : el("p", { className: "muted", text: "Empty." });
      box.replaceChildren(
        el("div", {}, [el("h3", { text: `Going (${s.confirmed.length} of ${s.capacity})` }), confirmed]),
        el("div", {}, [el("h3", { text: `Waitlist (${s.waitlist.length})` }), waitlist]),
      );
    } catch (err) {
      box.replaceChildren(el("p", { className: "muted", text: errorText(err, ERRORS) }));
    }
  }

  // Run an action, show the result and reload the page data.
  async function act(fn, okText, okFn) {
    clearMessage(message);
    try {
      const r = await fn();
      showMessage(message, "success", okFn ? okFn(r) : okText);
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      showMessage(message, "error", errorText(err, ERRORS));
    }
    await load();
  }

  async function load() {
    try {
      current = await api("events", `/events/${encodeURIComponent(id)}`);
    } catch (err) {
      if (redirectOnAuthError(err)) return;
      document.getElementById("event").hidden = true;
      showMessage(message, "error", errorText(err, ERRORS));
      return;
    }
    const e = current;
    document.title = `${e.title} · Campus Club`;
    const title = document.getElementById("title");
    title.replaceChildren(el("span", { text: e.title }));
    if (e.status !== "published") title.append(badge(e.status, e.status));
    document.getElementById("meta").textContent =
      `${formatDate(e.startsAt)} · ${e.location}${e.isOutdoor ? " · outdoor" : ""} · organised by ${e.createdByName || "an officer"}`;
    document.getElementById("description").textContent = e.description;
    document.getElementById("seats").textContent =
      `${e.confirmedCount} of ${e.capacity} going · ${e.seatsLeft} seats left${e.waitlistCount ? ` · ${e.waitlistCount} on the waitlist` : ""}`;
    document.getElementById("event").hidden = false;
    renderRsvp(e);
    loadWeather(e);
    if (officer) {
      renderOfficer(e);
      loadSignups();
    }
  }

  if (officer) {
    document.querySelector(".officer-only").hidden = false;
    const form = document.getElementById("edit-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const e = current;
      const start = new Date(form.startsAt.value);
      const changes = {};
      const set = (k, v) => { if (v !== e[k]) changes[k] = v; };
      set("title", form.title.value.trim());
      set("description", form.description.value.trim());
      if (!Number.isNaN(start.getTime()) && start.toISOString().slice(0, 16) !== e.startsAt.slice(0, 16)) changes.startsAt = start.toISOString();
      set("location", form.location.value.trim());
      set("capacity", Number(form.capacity.value));
      set("isOutdoor", form.isOutdoor.checked);
      if (form.isOutdoor.checked) {
        if (form.latitude.value !== "") set("latitude", Number(form.latitude.value));
        if (form.longitude.value !== "") set("longitude", Number(form.longitude.value));
      }
      if (Object.keys(changes).length === 0) {
        showMessage(message, "info", "Nothing changed.");
        return;
      }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      await act(() => api("events", `/events/${encodeURIComponent(id)}`, { method: "PATCH", body: changes }), null,
        (r) => (r.promotedFromWaitlist ? `Saved. ${r.promotedFromWaitlist} moved up from the waitlist.` : "Saved."));
      button.disabled = false;
    });
  }

  if (new URLSearchParams(location.search).get("created")) {
    showMessage(message, "success", "Draft created. Publish it when it is ready.");
  }
  load();
}
