// Membership request page: POST /membership-requests on the Membership service.
// The same rules are checked here for quick feedback; the server checks
// them again and is the one that decides.

import { api } from "../shared/api.js";
import { getSession, pageUrl } from "../shared/auth.js";
import { clearMessage, el, errorText, renderHeader, showMessage } from "../shared/ui.js";

renderHeader();

const form = document.getElementById("join-form");
const message = document.getElementById("message");
const FIELDS = ["fullName", "email", "password", "confirm"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (getSession()) {
  form.hidden = true;
  message.replaceChildren(
    el("p", { className: "message message-info", text: "You are already signed in, so you are a member. " }, [
      el("a", { text: "Go to the home page", attrs: { href: pageUrl("index.html") } }),
    ]),
  );
}

const FIELD_ERRORS = {
  fullName: "Enter your name (2 to 100 characters).",
  email: "Enter a valid email address.",
  password: "Use 8 to 72 characters.",
  confirm: "The passwords do not match.",
};

function setFieldErrors(fields) {
  for (const name of FIELDS) {
    const input = form.elements[name];
    const hint = document.getElementById(`${name}-error`);
    const bad = fields.includes(name);
    input.setAttribute("aria-invalid", bad ? "true" : "false");
    hint.textContent = bad ? FIELD_ERRORS[name] : "";
  }
}

function localCheck(values) {
  const bad = [];
  if (values.fullName.length < 2 || values.fullName.length > 100) bad.push("fullName");
  if (!EMAIL_RE.test(values.email) || values.email.length > 254) bad.push("email");
  const bytes = new TextEncoder().encode(values.password).byteLength;
  if (values.password.length < 8 || bytes > 72) bad.push("password");
  if (values.confirm !== values.password) bad.push("confirm");
  return bad;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(message);

  const values = {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value,
    confirm: form.confirm.value,
  };
  const bad = localCheck(values);
  setFieldErrors(bad);
  if (bad.length > 0) {
    form.elements[bad[0]].focus();
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api("membership", "/membership-requests", {
      method: "POST",
      auth: false,
      body: { fullName: values.fullName, email: values.email, password: values.password },
    });
    form.reset();
    form.hidden = true;
    showMessage(message, "success",
      "Request sent. An officer will review it, and you can sign in once it is approved.");
  } catch (err) {
    if (err.code === "validation_failed" && Array.isArray(err.body?.fields)) {
      setFieldErrors(err.body.fields);
      showMessage(message, "error", "Some fields are not valid.");
    } else if (err.code === "email_already_registered") {
      showMessage(message, "error",
        "This email already has an account or a request waiting for review.");
    } else if (err.code === "too_many_pending_requests") {
      showMessage(message, "error",
        "The club has too many requests waiting for review. Please try again later.");
    } else if (err.code === "rate_limited") {
      showMessage(message, "error",
        "Too many requests from this network. Try again in an hour.");
    } else {
      showMessage(message, "error", errorText(err));
    }
    form.password.value = "";
    form.confirm.value = "";
  } finally {
    button.disabled = false;
  }
});
