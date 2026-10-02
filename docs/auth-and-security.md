# Auth and security

How a room is protected once the Cloudflare side exists.
Nothing here is implemented yet; the README's sync hook and `WorkerApi` are the seams it attaches to.
Where the doc says "the Worker does", read "will do".

## What there is to protect

A room is used by two people and carries three kinds of value.

- The room's data, read and written over the WebSocket.
  Leaking it exposes the trip's notes; a stranger could also scribble on them.
- The paid APIs the Worker calls on the room's behalf: Claude for `draftDay`, Workers AI (Clef) for classification, Google Maps for a future Places lookup.
  Anyone who can reach the Worker can spend our money.
- The API keys themselves.
  Leaking one is the same as the point above, minus the Worker.

A secret URL protects none of the first two.
URLs end up in browser history and sync, in chat link previews, in screenshots, in `Referer` headers and in access logs, and a URL cannot be revoked without recreating the room.

The goal, in order: nobody outside the two allowed people can cause a paid call; a lost logged-in phone or a bug can only spend a bounded amount; nobody outside a room can read or write it.

## One hostname

The Worker serves the SPA from its static assets binding and answers the API and the WebSocket on the same hostname, and Cloudflare Access protects that one hostname.
This is not a convenience; Access depends on it.
The Access cookie is set for the protected hostname only, and a `fetch` or a WebSocket handshake cannot follow the redirect to the login page.
With the SPA elsewhere, the first API call would fail and the login would never start.

Access has two ways to protect a Worker, and only one of them works here.
A Worker-level policy (the one-click "Enable Cloudflare Access" on the Worker, scoped to previews only or to all hostnames) answers every WebSocket upgrade with 403 before authentication; the Workers docs list this as a current limitation and point WebSocket Workers to a hostname-based application instead.
So the Access application is a self-hosted one targeting the bare custom hostname, no path, with Allow policies only (no Bypass, no Service Auth), which handles the upgrade: 302 to login when unauthenticated, proxied through when authenticated.

A hostname application covers only that hostname.
The Worker is also reachable on its `workers.dev` subdomain and on preview URLs, so the `workers.dev` route is disabled in `wrangler.jsonc` and preview URLs are turned off; both are checked before the first secret is bound.

`ctx.access` is not used.
It is filled only for Worker-level policies and does not reach a Worker that serves static assets, so the Worker reads and verifies the JWT itself as described below.
That also means the `access.dev` block in `wrangler.jsonc` (which feeds `ctx.access`) does not exercise `identify`; local development signs a test JWT with a throwaway key and points the certs URL at a local stub.

## Cross-site requests

Access checks the cookie, not where the request came from.
A WebSocket handshake is not subject to CORS, and a cross-origin `POST` with a form or `text/plain` body is sent with cookies; only the response is hidden.
So a member who is logged in and opens a stranger's page would let that page open our socket or post to our API on their behalf.

The Worker rejects any API or upgrade request whose `Origin` header is not the app's own origin, requires `Content-Type: application/json` on API calls, and the Access application's cookie is set to `SameSite=Strict`.
There is no CORS configuration, so no other origin is ever allowed.

## Who is asking

Access is the first mechanism.
The two members' e-mail addresses are allowed; login is a one-time code by e-mail or Google.
The free tier covers 50 users and adding or removing a person happens in the dashboard.

The Worker answers "who is asking" in one function, `identify(request)`, so the mechanism can change without touching the rest.
It returns a verified e-mail or throws; it never returns a member id, and it never treats a missing header as "development".

- It reads the JWT from `Cf-Access-Jwt-Assertion` only.
  Access sets the header on proxied requests including the WebSocket upgrade; the cookie is not read, which keeps the cookie out of our own code paths.
- It verifies the signature against the team's `/cdn-cgi/access/certs`, cached, with the `kid` picked from the header; keys rotate every six weeks and the old one stays valid for seven days.
  A cache older than seven days is not used, and a failed certs fetch rejects the request.
- It checks `aud` against the application's AUD tag, `iss` against the team domain, `exp` and `nbf` with 60 seconds of skew.
  Without the `aud` check a token from any other Access application on the team, or a service token, would pass.

Access decides who may reach the app at all.
It does not decide who is in which room; that is the room's own table, below.

An invite link that is swapped for a per-device session cookie on first visit is the likely successor, since it matches the product better: send a link, and the other person is in.
It costs token issuing, revocation and cookie handling, so it waits until Access is in the way.
Passkeys are more than two people need.

## Rooms and members

A room is a Durable Object.
Its id is not derived from the room's name; `idFromName` resolves every name, so a name would let any allowed e-mail open any room.
The id comes from a random token minted at creation.

A `rooms` index object, one per account, maps each e-mail to its rooms as `{ roomId, memberId }` pairs.
It is what the app lists on its first screen, it is where the spend budget lives (below), and it is the only place an e-mail is stored next to a member id, so a changed e-mail is a single rewrite here.

The room object holds the member table, so the membership check runs inside the object, before it acts, with the verified e-mail passed in the request to the stub.
A member id never travels from the client as a claim of identity.

Creating and joining are explicit operations, not side effects of a first visit.

- `room:create` is called by any authenticated e-mail.
  The caller becomes the first member and the room's creator.
  An e-mail may have at most ten rooms, counted in the index.
- `room:invite(email)` is called by an existing member of that room.
  The invitee must also be allowed by Access, or the invitation sits unused.
- `room:remove(member)` and `room:delete` are called by the creator, or by any member with the other member's confirmation recorded in the room.
  Deleting a room calls `deleteAll` on its object, removes it from the index and invalidates its booklet slug.
- Everything else from an e-mail that is not in the table is rejected inside the object.

`MemberId` is a random id assigned by the room at creation or invitation.
The e-mail is a login attribute stored in the index and may change, and so may the mechanism behind `identify`; the id does not.
This is what lets Access be replaced by invite links later without touching notes.

## Agents have no identity

`Member` treats people and agents alike, which is right for the UI and wrong for authentication.
`Member` gains a `kind`, person or agent.
The room creates its agent members itself at `room:create` with fixed ids; `room:invite` can only create a person, so nobody can join under the agent's name and colour.

An agent cannot log in, so it is never in the Access allowlist and never in `identify`'s output.
It is written as only by the Worker, from inside a request that was authenticated as a human member: `draftDay` sets `DayDraft.by` to the agent's id from server logic.
Alarms and scheduled handlers never call a paid API; every paid call runs inside a request that `identify` accepted.

The room strips `by` from every client payload and stamps it with the caller's own member id.
`useMembers().me` on the client is for display only.
Without the stripping, a human could post a note as the agent, or as the other person.

## Paid APIs

Claude is called inside `draftDay` with a key held as a Worker secret; the browser never sees it.
The Anthropic console gets a monthly spend limit for the workspace.

Clef runs through the Workers AI binding, so there is no key to leak.
The account is on the Workers Paid plan (for Durable Object and R2 limits), and on that plan Workers AI has no hard cap: past the free 10,000 Neurons a day it is pay as you go.
Access alone does not bound it.

Google Maps splits in two.
A future Places lookup from the Worker uses a secret key.
IP restriction on that key is useless, since the Worker egresses from Cloudflare's shared ranges; the key is restricted to the Places API and the API's daily quota is set to a few dozen requests, which is a day of brainstorming.
Anything that runs in the browser (an Embed API iframe, the JS API) ships its key to the client by design.
Access cannot help there; the key is restricted by HTTP referrer and by API, and that is the only protection.
The map today is MapLibre + OpenFreeMap, so no browser key exists yet.

## The budget

The budget is what bounds a lost phone or a bug, so it is specified rather than named.

- It lives in the `rooms` index, keyed by e-mail, so it is one budget per person across all their rooms.
  A per-room budget would multiply by `room:create`.
- It has a daily ceiling and a per-trip ceiling, both constants in `wrangler.jsonc` vars.
  No mutation can read or change them; raising one is a deploy.
- Every outbound call counts: `draftDay`, each Clef classification, each Places lookup, each short-link expansion.
- The order is reserve, call, settle.
  The index decrements before the outbound request; a verified failure (a 4xx or 5xx from the provider) refunds; a timeout or an exception is treated as spent.
  Recording after the call would let a retry between the call and the record spend unrecorded money.
- The room object keeps the ledger of who, when and how many tokens, for tracing a surprising bill.
  It stores member ids, not e-mails.

Cloudflare billing notifications and a Google Cloud budget alert are the second line; the index is the first.

## Expanding short links

A pasted `maps.app.goo.gl` link hides its coordinates behind an HTTP redirect, and the browser cannot read the `Location` of a cross-origin redirect.
The Worker reads it instead; no Google key is involved.

The Worker is fetching a URL the user typed, so the fetch is fenced.

- Only the short-link hosts Google Maps hands out are accepted: `maps.app.goo.gl`, `app.goo.gl/maps`, `goo.gl/maps` (kept alive past the 2025 `goo.gl` shutdown) and `g.co`.
  Anything else is returned to the client unchanged.
- The fetch sends a desktop `User-Agent` and uses `redirect: "manual"`, and reads `Location` from the one response.
  A sample link answers 302 with `Location: https://www.google.com/maps/search/<lat>,+<lng>?...`, so the coordinates are already in the header.
- The `Location` is accepted only when its host is `google.<tld>` or `google.<cc>.<tld>` with an optional `www.` or `maps.` (`www.google.com`, `maps.google.com`, `www.google.com.tw`); this is the host shape GeoShare, which resolves these links in production, accepts.
  A `Location` of the Google Maps Go form `maps.app.goo.gl/?link=<url>` is unwrapped and the inner URL held to the same rule.
  The page behind the `Location` is never fetched, so the consent page Google shows to fresh clients never enters the picture.
  Anything else is returned unexpanded and the note is placed by long-press instead.
- Expansions count against the member's budget like any other outbound call.

## What stays outside Access

Access guards a hostname, so anything meant to be public lives on a second custom hostname bound to the same Worker.
On that hostname the Worker serves only published booklets from R2; no API route and no WebSocket is bound to it.

The booklet that `exportBooklet` publishes is read-only and may be shown to people outside the room.
A secret URL is fine there as long as the page costs nothing to view.

- The path is `/r/<slug>/shiori` with a random slug minted at each publish, not the room's name, so it cannot be enumerated.
  Publishing again rotates the slug; rotating is how a leaked link is withdrawn.
- The page never carries a Google key.
  Places are links to Google Maps, as in the app, and the map on it is a static image.
  Workers cannot run MapLibre and Browser Rendering is a paid call, so the image is captured from the member's own MapLibre canvas in the browser and uploaded with the export; the Worker checks it is a PNG under 2 MB and serves it with `Content-Type: image/png` and `X-Content-Type-Options: nosniff`.
- The export escapes note titles, bodies, member names and tags the way the Vue templates do (rendered from the same components, or escaped explicitly), validates member colors with `hexColor` before they reach a `style`, and ships a CSP that forbids inline script.
- The room records who published, and whether a room publishes at all is a room setting that the creator or both members control.

The single-file build (`vite.single.config.ts`) is a demo that runs on mock data from disk.
Its config defines `import.meta.env.VITE_MOCK` as `"true"`, so the bundle always installs the mocks and an API origin, once one exists, is never read into it.

## Mutations

The client cannot be trusted to have run its own checks, so the room validates every mutation with the same ones (`currencyCode`, `hexColor`, and whatever follows).

- A message larger than 32 KB is rejected; the platform accepts up to 32 MiB per WebSocket message, so this is ours to enforce.
- Each member has a token bucket for messages, separate from the paid-call budget.
- `updatedAt` and ordering are assigned by the room, not sent by the client.
- `note:delete` is a soft delete with 30 days of history, so one member cannot wipe the room beyond recovery.
- The room's state is snapshotted to R2 nightly by an alarm; the alarm does nothing else.

## Sessions and secrets

Access sessions can last from 15 minutes to a month.
The trip is in Taiwan, which reaches Cloudflare (there is a Taipei PoP), Google, OpenFreeMap and Anthropic without restriction, but a login during the trip is still a nuisance, so the session is set to a month before departure.
A month is also how long a lost phone stays logged in; a member and their sessions can be revoked at once in Zero Trust, and the budget bounds what the phone can spend until then.

Snapshots expire after 30 days; nothing else is kept outside the room object and the index.

`.dev.vars*` is in `.gitignore`; `wrangler.jsonc` holds no secret.
