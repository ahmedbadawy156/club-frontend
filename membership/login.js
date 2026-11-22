// Sign-in page: POST /auth/login on the Membership service.

import { api } from "../shared/api.js";
import { getSession, pageUrl, safeNext, saveLogin } from "../shared/auth.js";
import { clearMessage, el, errorText, renderHeader, showMessage } from "../shared/ui.js";

renderHeader();

const form = document.getElementById("login-form");
const message = document.getElementById("message");
const next = new URLSearchParams(location.search).get("next");

if (getSession()) {
  form.hidden = true;
  message.replaceChildren(
    el("p", { className: "message message-info", text: "You are already signed in. " }, [
      el("a", { text: "Go to the home page", attrs: { href: pageUrl("index.html") } }),
    ]),
  );
}

function minutes(seconds) {
  const n = Math.max(1, Math.ceil(Number(seconds) / 60));
  return `${n} minute${n === 1 ? "" : "s"}`;
}

function loginErrorText(err) {
  switch (err.code) {
    case "invalid_credentials":
      return "Email or password is incorrect. If your membership request is still waiting for review, you cannot sign in yet.";
    case "account_locked":
      return `This account is locked after too many failed attempts. Try again in ${minutes(err.retryAfter ?? 900)}.`;
    case "rate_limited":
      return "Too many sign-in attempts from this network. Try again in 15 minutes.";
    case "try_again_later":
      return "The sign-in service is busy. Try again in a minute.";
    case "validation_failed":
      return "Enter a valid email address and your password.";
    default:
      return errorText(err);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(message);

  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    showMessage(message, "error", "Enter your email and password.");
    return;
  }

  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const login = await api("membership", "/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    saveLogin(login);
    location.assign(safeNext(next));
  } catch (err) {
    form.password.value = "";
    showMessage(message, "error", loginErrorText(err));
    button.disabled = false;
  }
});
