# chirashitabi

Scatter first, then it becomes an itinerary. A brainstorming notebook for a trip, shared by two people.
The app is called chirashitabi; each trip gets its own room, such as "Taiwan trip".

A canvas prototype split into SFCs on Vue 3.6 RC Vapor Mode.
Toolchain: pnpm + [Vite+](https://viteplus.dev/) (`vp`); SFC compilation, type checking, linting and formatting by [Vize](https://github.com/ubugeeei-prod/vize).

```bash
vp install
vp dev
vp run check   # format + lint + type check (Vize)
vp build
vp build -c vite.single.config.ts   # single-file build (dist-single/)
vp run check:worker                 # wrangler types + tsc on worker/
vp run deploy                       # VITE_MOCK=false build, then wrangler deploy
```

CI (`.github/workflows/ci.yml`) runs the checks on every pull request and push, and deploys `main` with `vp run deploy` once they pass, using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; "Run workflow" in the Actions tab does the same by hand.

`vp dev` on its own boots with the mock data in `src/mocks/` (a Taiwan trip) and talks to no Worker.

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
  main.ts, App.vue, style.css   Boot and view switching (the canvas stays mounted underneath)

  views/
    Canvas.vue   Pan / pinch / drag / long-press, card menu, adding notes
    Map.vue      MapLibre + OpenFreeMap: pins, a day's route, long-press to add
    Shiori.vue   The booklet (edit / read, appendix, a member's draft of a day)
    Form.vue     Full-screen note form (new / edit, Google Maps link -> coordinates)
    Rooms.vue    The first screen: your trips, or make one (trip, your name and color)

  features/
    members/ Everyone in the room, people and agents alike
    notes/   Notes: store, types; input (the form's text -> title, body, tags)
    sync/    useSync (the session: which room, who this device is in it, where changes go); keys
             (the room's cache keys); useRoom (the socket to a room, written into the cache); ledger
             (confirmed state and our unanswered changes); persist (the room kept on the device);
             wire (the room's JSON back into the app's types)
    trip/    The room's trip (name, days, currency, map center); itinerary (notes on a day,
             status, budgets, assigning a day, adopting a draft); formatting
    tags/    Tag colors and the tag filter (store, filter bar)
    place/   Google Maps links: parsing, safe hrefs; pins; a day's route as GeoJSON
    canvas/  Sticky note card; transform (screen <-> world, zoom, pinch, fit); useViewport (the animated view)
    worker/  WorkerApi: drafting a day (POST /api/rooms/<id>/draft, by the room's agent), booklet export

  shared/  Types every feature can use: Brand; CurrencyCode and formatMoney; HexColor

  i18n/    UI messages in MessageFormat 2 (messages/en.ts is the source, ja.ts follows it);
           format (messageformat, cut at markup); useI18n (the locale: picked here or the
           browser's, remembered on this device); Message.vue (markup -> slots);
           README.md (how it fits together); docs/ (writing messages, adding a locale)

  icons/   The icons as .svg files (tabs, write, back); Icon.vue paints one in the text color

  mocks/   Mock room data (members, trip, notes) and a mock WorkerApi, installed at boot

src/ui/             The design system: props, slots and events only, no app imports
  styles/        Tokens (colors, type, z-index, motion), base, transitions (ct-morph / ct-fade / ct-slide),
                 named media queries (media.css)
  components/
    chip/        CtChip: a pill, optionally tinted, selected or a toggle
    segmented/   CtSegmented: the pill morphs to the choice
    tab/         CtTabList: the underline slides to the tab; CtTabPanel: content morphs in;
                 CtTabBar: bottom navigation, the highlight slides behind the current item
  composables/   useIndicator: measures the selected child so an indicator can slide to it
  index.ts, types.ts   The public entry and the shared CtOption type

scripts/            dev-access.mjs: stands in for Cloudflare Access on a laptop (see "Running against the Worker")

.claude/skills/impeccable/   A text-only copy of the Impeccable design skill (SKILL.md + reference/, no scripts
                             or hooks); PROVENANCE.md says what is left out and why

worker/             The Cloudflare Worker (wrangler.jsonc at the root; `vp run check:worker` type-checks it)
  index.ts          Branches on the hostname, then identify -> Origin check -> the room API; one
                    structured log event (evlog) per API request, read with `wrangler tail`
  access.ts         AccessVerifier: the Access JWT -> a verified e-mail (signature, aud, iss, exp, nbf)
  rooms-index.ts    RoomsIndex: e-mail -> { room, member id }; the only place an e-mail is stored;
                    the budget of paid calls per person (reserve before the call, refund on a provider error)
  claude.ts         Claude (claude-sonnet-5-5) for the room's agent: drafting a day, its answer checked
  room.ts           Room: the trip, its notes and members in SQLite; the socket: snapshot on connect,
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
`useWorker().api` (drafting, export) is still the mock.

`src/app/mocks/index.ts` hands the same state to `useRoom().offline`.

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
