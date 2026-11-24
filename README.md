# club-frontend

Browser frontend for Team 10's Campus Club Management project
(Cloud Computing and Cloud Security, 26CSCN29H). Plain HTML, CSS and
JavaScript with `fetch`; no frameworks or third-party scripts. Hosted as a
static site in an **Amazon S3 bucket on Floci** (a local AWS emulator).

It calls three backend services, each in its own repository:

| Folder | Service repository | Owner |
|---|---|---|
| `membership/` | `club-membership-service` | Ahmed Emad Badawy |
| `events/` | `club-events-service` | Ahmed Ibrahim Nassar |
| `announcements/` | `club-announcements-service` | Mazen Mohammed Abdelfattah |

Each member commits only the pages in their own folder. Changes to
`shared/` are reviewed by the team because every page uses it.

> **Status:** works on Floci against all three services (each an Express app
> on Lambda behind API Gateway). Nothing is deployed to real AWS.

## Pages

| Page | Who | What it does |
|---|---|---|
| `index.html` | Everyone | Home page with links for the visitor's role |
| `membership/join.html` | Visitors | Send a membership request |
| `membership/login.html` | Visitors | Sign in (approved members and officers) |
| `membership/requests.html` | Officers | Approve or reject requests |
| `membership/members.html` | Officers | Search members, change roles |
| `membership/audit.html` | Officers | Read the audit log |
| `events/index.html` | Members, officers | Upcoming and past events; officers also see drafts and cancelled events and create events |
| `events/event.html` | Members, officers | Event details, RSVP or join the waitlist, cancel own RSVP, Open-Meteo forecast; officers edit, publish, cancel and see sign-ups |
| `announcements/index.html` | Members, officers | Current announcements, pinned first; officers publish, schedule, pin, edit and archive |
| `announcements/activities.html` | Members, officers | Past club activities; officers record one per finished event (pre-filled from a past event page) |

## Shared code (`shared/`)

| File | Use it for |
|---|---|
| `config.js` | Each service's API address (`config.events.apiUrl`, ...). No keys of any kind |
| `api.js` | `api(service, path, { method, body, query, auth })`: adds the login token, throws `ApiError` with the server's `code` and `retryAfter` |
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

### Tokens

The Membership login returns a 15-minute RS256 token. Its role is in the
`role` claim (`member` or `officer`), the user id in `sub`, issuer
`club-membership`, audience `campus-club`. There is no refresh token: when it
expires, the user signs in again. Other services verify it with the public
key from `GET /api/auth/public-key` on the Membership API.

## Rules every page follows

These are part of the security design (threat model, threats 3, 4 and 7).

1. **Show user text only with `textContent`** (use `el()`), never `innerHTML`.
2. **No inline scripts or styles.** Each page loads one module file and
   carries the same `Content-Security-Policy` meta tag (copy it from an
   existing page). It allows API calls only to
   `http://*.execute-api.localhost.floci.io:4566`.
3. **No keys or secrets** in this repository or the bucket.
4. **Role checks in pages are for display only.** Every permission is
   enforced by the backend; pages handle 401 and 403 with
   `redirectOnAuthError()`.

## Deploy to Floci

Requirements: Node.js, the AWS CLI with the `floci` profile, and the
Membership service deployed on Floci (`bash infra/deploy.sh` in
`club-membership-service`). In PowerShell use `npm.cmd` if script execution
is blocked.

```
npm run deploy
```

Then open http://localhost:4566/club-web/index.html (use `localhost`, not
`127.0.0.1`: the API only allows the origin `http://localhost:4566`).

`npm run deploy` generates `shared/config.local.js` from each service's
`infra/out/api.env` (Membership is required; Events and Announcements are
added when deployed; Git ignores the file, because each Floci deployment has
its own API id), creates the bucket `club-web` if needed, and uploads only
the HTML, CSS and JS files with the right content types and `no-cache`, so a
new deploy shows up on the next page load.

Deploy the services first, in this order: Membership, then Events and
Announcements (they need Membership's public key). The repositories must sit
side by side in one folder, because the config script reads
`../club-<service>-service/infra/out/api.env`.

## Known limits

- Tokens are kept in `sessionStorage`, which any script on the page could
  read. The strict CSP and the `textContent` rule are the defence.
- Every bucket and Floci Dash share the origin `http://localhost:4566` on
  Floci, so the API's CORS rule cannot tell them apart. On real AWS each
  website bucket has its own address.
- A token cannot be revoked before it expires; signing out forgets it in
  the tab, and it expires within 15 minutes.
