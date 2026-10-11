# chirashitabi

Scatter first, then it becomes an itinerary. A brainstorming notebook for a trip, shared by two people.
The app is called chirashitabi; each trip gets its own room, such as "Taiwan trip".

A canvas prototype split into SFCs on Vue 3.6 RC Vapor Mode.
Toolchain: pnpm + [Vite+](https://viteplus.dev/) (`vp`); SFC compilation, type checking, linting and formatting by [Vize](https://github.com/ubugeeei-prod/vize).

```bash
vp install
vp dev
vp run check   # format + lint + type check (Vize)
vp run fmt     # format the SFCs (Vize) and the rest
vp run musea   # the component gallery (Vize Musea) at /__musea__
vp build
vp run check:worker                 # wrangler types + tsc on worker/
vp run deploy                       # VITE_MOCK=false build, then wrangler deploy
```

CI (`.github/workflows/ci.yml`) runs the checks on every pull request and push, and deploys `main` with `vp run deploy` once they pass, using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; "Run workflow" in the Actions tab does the same by hand.

`vp dev` on its own talks to no Worker: `src/app/mocks/` answers `/api` and the room's socket in the page with MSW, from a seeded Taiwan trip, and the app runs the same code it runs against the Worker. Nothing the mocks hold survives a reload.

## Running against the Worker

Three processes, in this order:

```bash
vp node scripts/dev-access.mjs you@example.com   # stands in for Access: JWKS stub, .dev.vars, a signed token
vp exec wrangler dev                              # the Worker on :8787, fetching keys from the stub
VITE_MOCK=false vp dev                            # the app on :5173; /api is proxied to :8787 with the token
```

The app then opens on the rooms screen; make a trip and it connects to the local Durable Object.
In production Access sets the token header itself; the stub only exists because a laptop has no Access in front of it.

## Layout

```
src/app/            The app
  main.ts, App.vue, style.css   Boot; every page under the one menu (the dock) and the toast
  router.ts    vue-router (its experimental router) over the pages' files (typed in
               typed-router.d.ts); opens the last trip
  sw.js        The service worker: keeps the build's files (listed into it by vite.config.ts) and a
               room's pictures, so the booklet opens with no connection; registered against the Worker only

  pages/       One .vue file per URL (vue-router's file-based routes); a folder named `__*` is not one
    __params/            The params' parsers (vue-router's experimental param parsers)
      roomId.ts          A room id, or the URL matches no page
      sheet.ts, number.ts   The memo sheet's query: writing or editing, and a place's lat / lng
    index.vue, new.vue   The trips (`/`), with the sheet making a new one (`/new`)
    useTrips.ts          Where the trips lead: into a trip, and the new trip's sheet
    rooms/[roomId=roomId].vue   A room: enters it, keeps each tab once opened (KeepAlive), the memo sheet
    rooms/url.ts         A room's tabs by their route, and the memo sheet's place in the URL's query
    rooms/[roomId=roomId]/
      canvas.vue   Pan / pinch; pick a card (tap), move, resize and turn it (handles), open it (double tap),
                   its toolbar (color, day, duplicate, delete); writing on the desk
      home.vue     The trip at a glance: dates, flights, the piles, the budget, who is in
      memo.vue     The memo form as a tab: each save goes on the canvas
      map.vue      MapLibre + OpenFreeMap: pins, a day's route, long-press to add
      shiori.vue   The booklet (edit / read, appendix, a member's draft of a day)

  features/
    members/ Everyone in the room, people (owner or guest) and agents alike; api and useMembers
             (who is in, whom the owner invited; inviting, removing, leaving, deleting); People (that,
             on the home tab)
    rooms/   The person's trips: api (/api/me with invitations and deleted trips, /api/rooms, answering
             an invitation, restoring); when (days to go, under way, over); TripTag (a trip as a luggage
             tag); NewTrip (the sheet that makes one, with its tag drawn live); Invitation (one to answer);
             Rooms (the list itself, each trip a luggage tag, coming up then been)
    notes/   Notes: store, types; input (the form's text -> title, body, tags); image (a photo shrunk
             on the device, and where a room's picture is shown from); Form (the note form, new or
             edit, Google Maps link -> coordinates: the memo tab, and a sheet over anything)
    sync/    useSync (the session: which room, who this device is in it, where changes go); keys
             (the room's cache keys); useRoom (the socket to a room, written into the cache); ledger
             (confirmed state and our unanswered changes); persist (the room kept on the device);
             wire (the room's JSON back into the app's types)
    theme/   Light or dark: the device's until picked (useTheme, remembered); ThemeSwitch, the dock's
             sun and moon, whose new colors spread from it like ink
    trip/    The room's trip (name, days, currency, map center, flights, stays); itinerary (notes on a
             day, status, budgets, assigning a day, adopting a draft, where a night is spent);
             formatting; settings and TripEditor (name, dates, flights and stays, edited on the home
             tab); FlightLine (a flight); StayLine (a stay)
    tags/    Tag colors and the tag filter (store, filter bar)
    place/   Google Maps links: parsing, safe hrefs; pins; a day's route as GeoJSON, from and back to
             the stays; how far apart two points are, and a walk's minutes
    canvas/  Sticky note card (a text box too); TextField (words being written on the desk); transform
             (screen <-> world, zoom, pinch, fit); useViewport (the animated view); usePlace (adding
             a note on the canvas, placed even before the canvas is opened)
    worker/  WorkerApi: by the room's agent, drafting a day (POST /api/rooms/<id>/draft) and leaving ideas
             on the canvas (POST /api/rooms/<id>/suggest); booklet export

  shared/  Types every feature can use: Brand; CurrencyCode and formatMoney; HexColor

  i18n/    UI messages in MessageFormat 2 (messages/en.ts is the source, ja.ts follows it);
           format (messageformat, cut at markup); useI18n (the locale: picked here or the
           browser's, remembered on this device); Message.vue (markup -> slots);
           README.md (how it fits together); docs/ (writing messages, adding a locale)

  icons/   The icons as .svg files (tabs, write, back); Icon.vue paints one in the text color

  mocks/   The Worker and its rooms in the page, for `vp dev` (MSW): seed data (members, trip,
           notes) and handlers for `/api` and the room's socket, started at boot

src/ui/             The design system: props, slots and events only, no app imports
  styles/        Tokens (colors, type, z-index, motion), base, transitions (ct-morph / ct-fade / ct-slide),
                 named media queries (media.css)
  components/    One directory per component (or family), named after it; each keeps its
                 harness, tests and *.art.vue (its page in Musea) beside it
    chip/        CtChip: a pill, selected or a toggle; CtChipRow: a row of them that scrolls;
                 CtChipPick: chips to pick one of, the ink stretching to the pick
    dock/        CtDock: the floating menu, magnifying under a mouse, sinking away under a sheet;
                 CtDockItem (an icon, its name above), one dot sliding under the open one,
                 CtDockGroup (items that fold away together), CtDockDivider
    fab/         CtFab: the one filled tool on a view
    hold-button/ CtHoldButton: held down to act, for what cannot be taken back
    indicator/   CtIndicator and useIndicator (internal): the pill that stretches to the
                 chosen child of CtChipPick, CtSegmented, CtSwatches and CtTabList
    segmented/   CtSegmented: the pill morphs to the choice
    swatches/    CtSwatches: colors to pick one of, ringed
    swipe-row/   CtSwipeRow: a row a finger slides left to show its actions behind it (swipe.ts: the math)
    tabs/        CtTabList: the underline slides to the tab; CtTabPanel: content morphs in
    text-morph/  CtTextMorph: text whose shared characters slide instead of being replaced
  composables/   usePageTurn, useViewTransition: motion the app runs on its own elements
  index.ts, types.ts   The public entry and the shared CtOption type
  musea.preview.ts     Musea's preview app: the interop plugin, so it mounts the Vapor components

public/             favicon.svg: three notes scattered on a red tile, served as they are
scripts/            dev-access.mjs: stands in for Cloudflare Access on a laptop (see "Running against the Worker")

.claude/skills/impeccable/   A text-only copy of the Impeccable design skill (SKILL.md + reference/, no scripts
                             or hooks); PROVENANCE.md says what is left out and why

worker/             The Cloudflare Worker (wrangler.jsonc at the root; `vp run check:worker` type-checks it)
  index.ts          Branches on the hostname, then identify -> Origin check -> the room API; one
                    structured log event (evlog) per API request, read with `wrangler tail`
  access.ts         AccessVerifier: the Access JWT -> a verified e-mail (signature, aud, iss, exp, nbf)
  rooms-index.ts    RoomsIndex: e-mail -> { room, member id }; the only place an e-mail is stored;
                    the budget of paid calls per person (reserve before the call, refund on a provider error)
  claude.ts         Claude (claude-sonnet-5-5) for the room's agent: drafting a day, suggesting ideas,
                    proposing the trip's candidate tags, naming the place a memo is about;
                    each answer checked
  clef.ts           Clef on Workers AI (clef-flash): which tags fit a memo, from its words and photo
  geocode.ts        OpenStreetMap's geocoder (Nominatim): the places a name finds, with real coordinates,
                    and what is at a pinned point (its name, else its street's)
  room.ts           Room: the trip, its notes and members in SQLite, and which pictures it has (their bytes
                    in the R2 bucket chirashitabi-images); the socket: snapshot on connect,
                    mutations checked, stamped (by, updatedAt), written and sent to the other sockets
  wire.ts           What crosses the socket (Temporal values as ISO strings) and the checks it must pass
  api.test.ts       The Worker in workerd via wrangler's test harness, Access stood in for by a throwaway key
  env.d.ts          ANTHROPIC_API_KEY (a secret), and ACCESS_CERTS_URL and ANTHROPIC_BASE_URL, which only
                    the tests set

docs/               Design notes: auth-and-security.md (one hostname behind Access, rooms and members, agents,
                    paid-API budgets, what stays public), data-fetching.md (the room in the query cache),
                    css.md (how the style sheets are written)
```

## Sync

`useSync().commit(mutation)` in `features/sync/useSync.ts` is the only way out.
`useRoom().connect(roomId)` installs a transport over the room's WebSocket and writes what the room shows into the Pinia Colada query cache, one entry per slice (`roomKeys` in `features/sync/keys.ts`: notes, trip, members).
`useNotes`, `useTrip` and `useMembers` read those entries with `useQueryState`; only the room writes them.
A snapshot also sets `useSync().me`, the member this device is.
Changes the room has not answered stay in the ledger and are sent again after the next snapshot (see `docs/data-fetching.md`).
`useWorker().api` is the room's agent and pictures over HTTP (`features/worker/api.ts`), set while in a room.

`note:move` is throttled to every 80ms while dragging.

Temporal values become ISO strings under `JSON.stringify` (`"2026-11-03"`, `"12:30:00"`).
The receiving side gets plain strings, so revive them with `Temporal.PlainDate.from` and friends before calling `apply`.
Currencies and member colors arrive as plain strings too; `currencyCode` and `hexColor` in `shared/` check them.

## Map

- Tiles come from OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`): free, no key.
- Coordinates come from the Google Maps link pasted into the form. Short `maps.app.goo.gl` links need the Worker
  to follow the redirect before `parseMapsUrl` sees them (not implemented yet; see `features/place/google-maps.ts`).
- When there are no coordinates, long-press the map to place the note.
- Google Maps is only an "open" link; no Google key ever ships to the browser (see `docs/auth-and-security.md`).
