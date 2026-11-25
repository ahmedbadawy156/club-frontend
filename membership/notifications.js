// Notifications page (any signed-in member or officer).
//   GET  /notifications?limit=50   your own notices, newest first
//   POST /notifications/seen       after showing them: everything is read
// Unread notices keep their highlight until you leave the page.

import { api } from "../shared/api.js";
import { pageUrl, requireRole } from "../shared/auth.js";
import {
  el, errorText, formatDate, redirectOnAuthError, refreshUnreadCount, renderHeader, showMessage,
} from "../shared/ui.js";

const session = requireRole(null);
if (session) {
  renderHeader();
  const list = document.getElementById("list");
  const message = document.getElementById("message");

  // Only links inside this site are followed (the server builds them).
  const safeLink = (link) => {
    if (typeof link !== "string" || !/^([a-z]+\/)?[a-z]+\.html(\?[\w=&%-]*)?$/i.test(link)) return null;
    return pageUrl(link);
  };

  function notice(n) {
    const href = safeLink(n.link);
    return el("li", { className: `notice${n.unread ? " notice-unread" : ""}` }, [
      el("h2", { text: n.title }),
      el("p", { text: n.text }),
      el("p", { className: "notice-time" }, [
        el("span", { text: `${n.unread ? "New · " : ""}${formatDate(n.createdAt)}` }),
        href ? document.createTextNode(" · ") : null,
        href ? el("a", { text: "Open", attrs: { href } }) : null,
      ]),
    ]);
  }

  try {
    const data = await api("membership", "/notifications", { query: { limit: 50 } });
    if (data.notifications.length === 0) {
      showMessage(message, "info", "No notifications yet.");
    } else {
      list.replaceChildren(...data.notifications.map(notice));
      if (data.unreadCount > 0) {
        await api("membership", "/notifications/seen", { method: "POST" });
        refreshUnreadCount();
      }
    }
  } catch (err) {
    if (!redirectOnAuthError(err)) showMessage(message, "error", errorText(err));
  }
}
