# Auth and security

How a room is protected on the Cloudflare side: the Worker (`src/worker/index.ts`), the rooms index (`src/worker/rooms-index.ts`) and each room (`src/worker/room.ts`).

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

## Invariants

The rest of this document is one way to hold these.
A change to the mechanisms is fine as long as every line here still holds; a review checks the mechanisms against this list and nothing else.

- A request that did not carry a JWT accepted by `identify` causes no outbound paid call and neither reads nor writes a room.
- A paid call runs only inside a request that `identify` accepted; alarms, cron triggers and queue consumers never make one.
- What one person can spend is bounded by constants that only a deploy can change, and the bound is enforced before the call is made.
- No API key or secret reaches the browser, the repository or a public page.
- The public hostname serves only published booklet files; viewing one costs nothing and triggers no outbound call.
- The client cannot assert who it is: `by` is stamped by the room, an agent is written as only by the Worker, and a room acts only for member ids the Worker resolved from the index.
- A page on another origin cannot make a member's browser call the API or open the socket.
- Only the owner can end a room, and a deletion can be taken back by either person for 30 days unless the owner has the room gone at once.
  Within a room that is not deleted, either member can change or remove what is in it: a deleted note does not come back, and new dates drop the days' lines past the new last day, so a member can lose the other's work; nothing keeps a copy to restore it from.

## One hostname

The domain is `chirashitabi.app`, registered at Cloudflare Registrar, so its zone is in our account.
The app lives on `chirashitabi.app` and the public booklet on `shiori.chirashitabi.app`, both Custom Domains of the one Worker (`routes` with `custom_domain: true` in `wrangler.jsonc`; Cloudflare creates the DNS records and certificates).
`.app` is HSTS-preloaded, so browsers never try plain HTTP against it.

The Worker serves the SPA from its static assets binding and answers the API and the WebSocket on the same hostname, and Cloudflare Access protects that one hostname.
`run_worker_first` is `true`, so the Worker code runs before the assets binding on every request and branches on `Host` first; it calls `env.ASSETS.fetch` only for the app hostname.
With the default, matching asset paths are served without running the Worker, on every hostname the Worker is bound to.
This is not a convenience; Access depends on it.
The Access cookie is set for the protected hostname only, and a `fetch` or a WebSocket handshake cannot follow the redirect to the login page.
With the SPA elsewhere, the first API call would fail and the login would never start.

Access has two ways to protect a Worker, and only one of them works here.
A Worker-level policy (the one-click "Enable Cloudflare Access" on the Worker, scoped to previews only or to all hostnames) answers every WebSocket upgrade with 403 before authentication; the Workers docs list this as a current limitation and point WebSocket Workers to a hostname-based application instead.
So the Access application is a self-hosted one targeting the bare custom hostname, no path, with Allow policies only (no Bypass, no Service Auth), which handles the upgrade: 302 to login when unauthenticated, proxied through when authenticated.

A self-hosted application's domain "must belong to an active zone in your Cloudflare account", and `workers.dev` is Cloudflare's zone, not ours.
That is why the design needs a registered domain; on `workers.dev` alone the only Access available is the Worker-level policy, which cannot carry the WebSocket.

A hostname application covers only that hostname.
The Worker is also reachable on its `workers.dev` subdomain and on preview URLs, so the `workers.dev` route is disabled in `wrangler.jsonc` and preview URLs are turned off; both are checked before the first secret is bound.

`ctx.access` is not used.
It is filled only for Worker-level policies and does not reach a Worker that serves static assets, so the Worker reads and verifies the JWT itself as described below.
That also means the `access.dev` block in `wrangler.jsonc` (which feeds `ctx.access`) does not exercise `identify`; local development signs a test JWT with a throwaway key kept in `.dev.vars` and points the certs URL at a local stub.

## Cross-site requests

Access checks the cookie, not where the request came from.
A WebSocket handshake is not subject to CORS, and a cross-origin `POST` with a form or `text/plain` body is sent with cookies; only the response is hidden.
So a member who is logged in and opens a stranger's page would let that page open our socket or post to our API on their behalf.

Every API call is a `POST` with `Content-Type: application/json`, so the browser always sends `Origin`; the Worker rejects any API or upgrade request whose `Origin` is missing or is not the app's own origin, and the Access application's cookie is set to `SameSite=Strict`.
There is no CORS configuration, so no other origin is ever allowed.

Pictures on cards are the one exception, and only for reading.
`GET /api/rooms/<id>/images/<image id>` comes from an `<img>`, which sends no `Origin`; it changes nothing, so it passes on Access's identity and the room membership alone, and answers only for a picture the room's list has, from that room's folder in the private R2 bucket.
An upload (`POST /api/rooms/<id>/images`) carries the picture's bytes rather than JSON and is held to the same `Origin` check as every other call, to one of three image types, to 1 MB, and to 100 pictures a room.
Each upload first drops the pictures no card shows that are more than a day old, from the room's list and then from R2, so a deleted card or a replaced photo gives its place back; the day spares a photo whose form is still open or whose card is still on its way from an offline device.

## Who is asking

Access is the first mechanism.
The two members' e-mail addresses are allowed; login is a one-time code by e-mail or Google.
The free tier covers 50 users and adding or removing a person happens in the dashboard.

The Worker answers "who is asking" in one function, `identify(request)`, so the mechanism can change without touching the rest.
It returns a verified e-mail or throws; it never returns a member id, and it never treats a missing header as "development".

- It reads the JWT from `Cf-Access-Jwt-Assertion` only.
  Access sets the header on proxied requests including the WebSocket upgrade; the cookie is not read, which keeps the cookie out of our own code paths.
- It verifies the signature against the team's `/cdn-cgi/access/certs`, cached in the Worker's memory, with the `kid` picked from the header; keys rotate every six weeks and the old one stays valid for seven days.
  A `kid` the cache does not have fetches the keys again, at most once a minute.
  When a fetch fails, the cached keys are still used while they are younger than seven days; with none that young, the request is rejected.
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
It is what the app lists on its first screen, it is where the spend budget lives (below), and it is the only place an e-mail is stored, so a changed e-mail is a single rewrite here.

For every request to an existing room the Worker resolves the verified e-mail to a `memberId` for that room in the index, and passes that id, not the e-mail, in the request to the room's stub.
`room:create` has no room yet: the new room mints the creator's id and returns it, and the Worker writes the index pair.
The room object holds its member table keyed by `memberId` and acts only for ids in it, so the check runs inside the object, before it acts.
A member id never travels from the client as a claim of identity.

Creating and joining are explicit operations, not side effects of a first visit.

- `room:create` is called by any authenticated e-mail.
  The caller becomes the first member and the room's owner (`creator` in its table).
  An e-mail may have at most ten rooms, counted in the index; a deleted room counts until it is gone for good.
- `room:invite(email)` is called by the owner, and a room holds at most `Room.MAX_PEOPLE` people (two).
  The room holds a seat for the invitation and the index records the e-mail against it; a held seat counts as taken, so the people plus the open invitations never exceed the limit.
  The invitee sees it in `/api/me` and answers it: accepting (`/api/invitations/<room>/accept`) brings their own color (and a name, blank for now), and the room mints their member id only then; declining gives the seat back, and so does the owner withdrawing it (`room:uninvite`).
  The invitee must also be allowed by Access, or the invitation sits unused.
- `room:remove(member)` is called by the owner, for anyone but themselves; `room:leave` by anyone else, for themselves.
  The room tells that person's sockets they are out (`gone`) and closes them, tells the rest who is in now (`members`), and the index forgets the membership; what they wrote stays, signed with their old id.
- `room:delete` is called by the owner and is a soft delete: the room is marked deleted, every socket is told and closed, the index stops resolving anyone in it and drops its open invitations, and either person who was in it can restore it for 30 days (`room:restore`).
  After 30 days an alarm deletes its pictures from R2, removes it from the index and calls `deleteAll` on the object; its public booklet, which deleting took down already, is gone with it. The owner can have that happen at once (`room:purge`), since only they deleted it; the other person, who could have restored it, cannot.
- Everything else from a member id that is not in the table, or in a deleted room, is rejected inside the object.

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
`useInRoom().me` on the client is for display only.
Without the stripping, a human could post a note as the agent, or as the other person.

## Paid APIs

A paid call is a request to a provider outside our own storage: Claude, Workers AI, Google, and the short-link fetch.
Writes to R2 and Durable Object storage are not paid calls.

Claude is called inside `draftDay` with a key held as a Worker secret; the browser never sees it.
The Anthropic console gets a monthly spend limit for the workspace.

Clef runs through the Workers AI binding, so there is no key to leak.
The account stays on the Workers Free plan, which hard-caps Workers AI at 10,000 Neurons a day (further calls fail) and still runs SQLite-backed Durable Objects, R2's free tier and WebSockets; two people never reach its 100,000 requests a day.
On the Paid plan the cap disappears and Workers AI becomes pay as you go, so moving to Paid is a cost decision, not an upgrade, and the budget below is what bounds Clef then.

Google Maps splits in two.
A future Places lookup from the Worker uses a secret key.
IP restriction on that key is useless, since the Worker egresses from Cloudflare's shared ranges; the key is restricted to the Places API and the API's daily quota is set to a few dozen requests, which is a day of brainstorming.
Nothing that runs in the browser gets a Google key: no Embed API iframe, no JS API.
Such a key ships to the client by design and a referrer restriction is the only thing between it and anyone who copies it, so the option is closed rather than mitigated.
The map is MapLibre + OpenFreeMap, and places are links to Google Maps.

## The budget

The budget is what bounds a lost phone or a bug, so it is specified rather than named.

- It lives in the `rooms` index, keyed by e-mail, so it is one budget per person across all their rooms.
  A per-room budget would multiply by `room:create`.
- It has a daily ceiling and a per-trip ceiling, both constants in `wrangler.jsonc` vars.
  No mutation can read or change them; raising one is a deploy.
- Every paid call counts: `draftDay`, each Clef classification, each Places lookup, each short-link expansion.
  Publishing the booklet counts too, not because R2 is paid but because its rate is the member's to choose; a refusal before the write (not the owner) or a failed write refunds.
- The order is reserve, call, settle.
  The index decrements before the outbound request; a verified failure (a 4xx or 5xx from the provider) refunds; a timeout or an exception is treated as spent.
  Recording after the call would let a retry between the call and the record spend unrecorded money.
- The room object keeps the ledger of who, when and how many tokens, for tracing a surprising bill.
  It stores member ids, not e-mails.

Cloudflare billing notifications and a Google Cloud budget alert are the second line; the index is the first.

Built for `draftDay` (`POST /api/rooms/<id>/draft`), the agent's suggestions (`POST /api/rooms/<id>/suggest`), tag suggestions (`POST /api/rooms/<id>/tags`) and finding a memo's place (`POST /api/rooms/<id>/places`), which share it.
Finding a place is one Claude call, which names the place as search strings; the coordinates then come from OpenStreetMap's geocoder (Nominatim), which is free and takes no key, so it is not budgeted. What reaches it is Claude's search string (a place's name, city and country), never the memo itself, with an identifying User-Agent and a timeout, at most one request a second for the whole app, as its usage policy asks: `RoomsIndex.geocoderTurn` hands out the turns, and a lookup that would wait more than five seconds fails instead.
A point pinned on the map is named the same way (`POST /api/rooms/<id>/where`): one reverse lookup at the geocoder, no Claude call, so it is not budgeted either; only the point's coordinates reach it.
A tag suggestion is one Clef call; the first one in a trip also makes the Claude call that proposes the trip's candidate tags, which the room then keeps, so each counts on its own.
Reading the kept candidates (`POST /api/rooms/<id>/candidates`) calls nothing outside the room, so it is not budgeted.
The ceilings count calls, `SPEND_PER_DAY` (20, a UTC day) and `SPEND_PER_TRIP` (200); a var that is missing or not a number allows nothing.
`RoomsIndex.reserve` refuses past either with a 429 naming which, and the app says so instead of offering a retry.
A provider answer outside 2xx refunds; no answer, or an answer that is not a draft, is spent.
The room's `agent_calls` table is the ledger.

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
- A short link most often leads to the place's name rather than its point: `/maps/place/<name>/data=…` with no coordinates, or a phone's `?q=<name>&ftid=…`.
  Then the name (the `q`, else the path's place) is looked up on OpenStreetMap's geocoder, which is free, and its first place's point comes back beside the link.
  The log keeps the shape it led to (`place`, `search`, …), not the place.

This is `src/worker/expand.ts`, answered at `POST /api/rooms/<id>/expand`.
Wrangler's test harness follows a redirect even with `redirect: "manual"`, so a runtime that followed is held to the same rule on the URL it ended at; `src/worker/expand.test.ts` shows how a `Location` is read.

## Previewing links

A note may carry the page its idea came from (a blog post, a video), and the Worker reads that page once for its title, a line and its picture (Open Graph; YouTube through its oEmbed, which takes no key).
A browser cannot read another site's HTML, so the Worker fetches a URL the member pasted, and the fetch is fenced (`src/worker/preview.ts`).

- Only an http(s) address with a named host is fetched: no other scheme, no address by number, no bare name (`localhost`, `intranet`), nothing under `.local`, and never the app's or the booklet's host.
  A redirect is followed at most three times, each hop held to the same rule, and the page is never fetched by a browser's cookies: the Worker has none.
- The page is read as HTML only, its first 512 KB (a longer page is cut there, its head being at the start), with a timeout; its picture only when it is one the room keeps (WebP, JPEG, PNG) and no larger than one it keeps (1 MB), read up to that and no further.
  The picture then becomes one of the room's pictures, counted against the room's hundred like an upload, and served to members only; nothing on the public booklet links back to the page.
- What the page said is checked like any other answer: a title cut to 200 characters, a line to 1000, entities decoded, so the note's words are text and never markup.
- The Worker never fetches Instagram: a post's page shows nothing without a login, and its oEmbed needs a Meta token and gives no title or picture.
  A note linking to one keeps the link and takes a screenshot as its picture.
- Each preview counts against the member's budget like any other outbound call, once the address has passed the fence (one it refuses is no preview, and free); the log keeps the page's site, never its address.

This is `POST /api/rooms/<id>/preview`; `src/worker/preview.test.ts` holds the fence's rules, `src/worker/api.test.ts` the route against a stub of the pages.

## What stays outside Access

Access guards a hostname, so anything meant to be public lives on `shiori.chirashitabi.app`, the second Custom Domain of the same Worker.
On that hostname the Worker serves only published booklets from R2; no API route and no WebSocket is bound to it.

The booklet a room publishes is read-only and may be shown to people outside the room.
A secret URL is fine there as long as the page costs nothing to view.

- Only the owner publishes (`POST /api/rooms/<id>/publish`) or takes it down (`/withdraw`); whether the room has a public page at all is theirs.
  Every member sees whether it is up and its link (`/publication`).
  The room records who published it and when.
- The page is one HTML file the room writes from its own data when the owner publishes (`src/worker/booklet.ts`), kept in R2 at `booklets/<slug>/shiori.html`; nothing a browser sends ends up on the public host.
  It is a snapshot: it shows the plan as it was then, until the owner publishes again.
- It carries the plan and nothing private: the trip's name and days, each day's line, its flights and where its night is spent, and the confirmed notes with their times, words and links.
  No budget, no booking number or page, no picture (pictures stay behind the room's membership), no member's name, no maybe.
- The path is `/r/<slug>/shiori` with a slug of 16 random bytes minted at each publish, not the room's name, so it cannot be enumerated; the host asks R2 only for a path of that shape.
  Publishing again rotates the slug and deletes the previous slug's file; rotating is how a leaked link is withdrawn, and taking it down deletes it.
  Deleting the trip takes it down at once rather than after the thirty days, and restoring the trip does not bring it back.
- The page never carries a Google key, and has no map: places are links to Google Maps, as in the app.
- Every word the travellers wrote is escaped, a link is only ever an http(s) one, and nothing is written into a `style` attribute (a note's paper is a class).
  The page has no script, and it is served with a CSP that allows none and nothing fetched (`default-src 'none'; style-src 'unsafe-inline'`, no base, no forms, no frames), with `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: public, max-age=60`, so a page taken down is out of caches within the minute.

The deployed build is made with `VITE_MOCK=false`, so the mocks (`src/app/mocks/`, which answer `/api` and the socket in the page) are not in its bundle.
MSW's service worker is emitted by its Vite plugin only beside a bundle that imports the mocks, so it is not in the deployed build either.

## Crawlers and metered features

A public endpoint that runs a metered Cloudflare feature per request is how a quiet site gets a large bill: an AI crawler fetched one site's `/_next/image` URLs about 2.5 million times and every hit ran Images Transformations.
This design has no such endpoint, and keeps it that way by rule.

- On `chirashitabi.app` a crawler meets Access and gets a 302 to the login page at the edge; the Worker never runs and nothing is metered.
- On `shiori.chirashitabi.app` the Worker reads a file from R2 and returns it; no transformation, no AI, no rendering.
  The Free plan caps the Worker at 100,000 requests a day and then answers Error 1027, so R2 sees at most about 3 million reads a month, inside its free 10 million.
  The limit's "fail open" mode, which "behaves as if no Worker is configured", is a setting of zone-level Workers Routes; a Custom Domain has no such field in its API and no origin behind it to fall open to, so past the cap both hostnames simply error.
- The R2 bucket has no public access and no `r2.dev` domain; the Worker is its only reader, so the Worker's cap is also R2's.
- No metered Cloudflare feature is enabled on the account: Images, Browser Rendering, paid AI Gateway, Workers Logs, Observability sampling above the free tier.
  Turning one on is a design change, not a dashboard click.
- The zone's AI bot policy is set to block on all pages, which Cloudflare offers to every customer; the booklet also sends `X-Robots-Tag: noindex` and serves a `robots.txt` that disallows everything.
  These reduce the traffic; the caps above are what bound it.
- Billing notifications are on, so an unexpected charge is seen the day it starts rather than on the invoice.

## Mutations

The client cannot be trusted to have run its own checks, so the room validates every mutation with the same ones (`currencyCode`, `hexColor`, and whatever follows).

- A message larger than 32 KB (its UTF-8 bytes) is rejected; the platform accepts up to 32 MiB per WebSocket message, so this is ours to enforce.
- Each member may send 200 messages in a fixed 10-second window, counted in the room's memory and separate from the paid-call budget; the moves of a card being dragged (a `note:move` with no `cid`) have a window of their own, so a long drag cannot crowd out the changes that are kept.
- `updatedAt` and ordering are assigned by the room, not sent by the client.
- The room remembers the last 1,000 `cid`s it applied for each member; a change sent again with one of them (its ack was lost on the way) is acked with its first `updatedAt` and not applied again.
- What the room writes holds to the same schemas the client's messages do: a suggestion card near the desk's edge is kept on it, and new dates that would run past 9999-12-31 are refused (`no such day`).
- `note:delete` sets the note's `deleted_at`; it leaves the snapshot, nothing restores it, and its id cannot be used again (`duplicate id`). Its picture is freed like any other a card no longer shows.
- Alarms do nothing but the delayed deletion above.
  There is no snapshot of a room's data; what a room keeps is in the room object alone.

## Sessions and secrets

Access sessions can last from 15 minutes to a month.
The trip is in Taiwan, which reaches Cloudflare (there is a Taipei PoP), Google, OpenFreeMap and Anthropic without restriction, but a login during the trip is still a nuisance, so the session is set to a month before departure.
A month is also how long a lost phone stays logged in; a member and their sessions can be revoked at once in Zero Trust, and the budget bounds what the phone can spend until then.

Outside the room objects and the index, the only other data is in R2: the rooms' pictures, which go with their room, and the published booklet files, which go with their slug.

`.dev.vars*` is in `.gitignore`; `wrangler.jsonc` holds no secret.
