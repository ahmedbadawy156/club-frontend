# club-frontend

Browser frontend for Team 10's Campus Club Management project
(Cloud Computing and Cloud Security, 26CSCN29H). Plain HTML, CSS and
JavaScript with `fetch`; no frameworks or third-party scripts.

It calls three backend services, each in its own repository:

| Folder | Service repository | Owner |
|---|---|---|
| `membership/` | `club-membership-service` | Ahmed Emad Badawy |
| `events/` | `club-events-service` | Ahmed Ibrahim Nassar |
| `announcements/` | `club-announcements-service` | Mazen Mohammed Abdelfattah |

Each member commits only the pages in their own folder. Changes to
`shared/` are reviewed by the team because every page uses it.

> **Status:** runs locally against the local Membership service. Events
> and Announcements are placeholder pages. Nothing is deployed; GitHub
> Pages hosting and Supabase are proposals pending TA approval.

## Pages

| Page | Who | What it does |
|---|---|---|
| `index.html` | Everyone | Home page with links for the visitor's role |
| `membership/join.html` | Visitors | Send a membership request |
| `membership/login.html` | Visitors | Sign in (approved members and officers) |
| `membership/requests.html` | Officers | Approve or reject requests |
| `membership/members.html` | Officers | Search members, change roles |
| `membership/audit.html` | Officers | Read the audit log |
| `events/index.html` | Placeholder | To be built by the Events owner |
| `announcements/index.html` | Placeholder | To be built by the Announcements owner |

## Shared code (`shared/`)

| File | Use it for |
|---|---|
| `config.js` | Each service's API address and publishable key (`config.events.apiUrl`, ...) |
| `api.js` | `api(service, path, { method, body, query, auth })`: adds the key and token, throws `ApiError` with the server's `code` |
| `auth.js` | `getSession()`, `requireRole(["officer"])`, `getAccessToken()`, `signOut()`, `pageUrl()` |
| `ui.js` | `el()` to build elements safely, `showMessage()`, `errorText()`, `redirectOnAuthError()`, `renderHeader()` |
| `styles.css` | Shared look: cards, forms, tables, tabs, messages |

Example for an Events page:

```js
import { api } from "../shared/api.js";
import { requireRole } from "../shared/auth.js";
import { el, renderHeader, redirectOnAuthError } from "../shared/ui.js";

const session = requireRole(["member", "officer"]);
if (session) {
  renderHeader();
  try {
    const data = await api("events", "/events", { query: { period: "upcoming" } });
    // build the page with el(...)
  } catch (err) {
    redirectOnAuthError(err);
  }
}
```

The access token comes from the Membership login. Its role is in
`app_metadata.role` (`member` or `officer`), and it lasts 15 minutes;
`auth.js` refreshes it automatically.

## Rules every page follows

These are part of the security design (threat model, threats 3, 4 and 7).

1. **Show user text only with `textContent`** (use `el()`), never
   `innerHTML`.
2. **No inline scripts or styles.** Each page loads one module file and
   carries the same `Content-Security-Policy` meta tag (copy it from an
   existing page). Add a new API origin to `connect-src` when a hosted
   service exists.
3. **Only publishable keys** in this repository. Never a secret key.
4. **Role checks in pages are for display only.** Every permission is
   enforced by the backend; pages handle 401 and 403 with
   `redirectOnAuthError()`.

## Run locally

Requirements: Node.js, and the Membership service running locally (see
its README). In PowerShell use `npm.cmd` if script execution is blocked.

```
npm install
npm run config:local
npm run dev
```

Then open http://127.0.0.1:5500.

- `npm run config:local` reads the running Membership stack (from
  `../club-membership-service`) and writes `shared/config.local.js`,
  which Git ignores. Run it again after restarting the stack.
- `npm run dev` serves the site on `127.0.0.1:5500` only. That address
  must be listed in the Membership service's `FRONTEND_ORIGINS`.
- When the Events and Announcements stacks exist, add their addresses and
  publishable keys to `scripts/make-local-config.mjs`.

## Hosted configuration (later)

Once hosted projects are approved and created, fill in `HOSTED` in
`shared/config.js` with each service's URL and publishable key, add the
GitHub Pages origin to each service's `FRONTEND_ORIGINS`, and publish the
site with GitHub Pages.

## Known limits

- Tokens are kept in `sessionStorage`, which any script on the page can
  read. The strict CSP and `textContent` rule are the defence against
  script injection.
- Account lockout and rate limits are enforced by the Membership service;
  the pages only show its messages.
