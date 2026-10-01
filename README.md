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
VITE_MOCK=false vp dev              # start with empty stores, no mock data
```

There is no room backend yet, so the app boots with the mock data in `src/mocks/` (a Taiwan trip).

## Layout

```
src/app/            The app (`@/…`)
  main.ts, App.vue, style.css   Boot and view switching (the canvas stays mounted underneath)

  views/
    Canvas.vue   Pan / pinch / drag / long-press, card menu, adding notes
    Map.vue      MapLibre + OpenFreeMap: pins, a day's route, long-press to add
    Shiori.vue   The booklet (edit / read, appendix, a member's draft of a day)
    Form.vue     Full-screen note form (new / edit, Google Maps link -> coordinates)

  features/
    members/ Everyone in the room, people and agents alike; who is using this device
    notes/   Notes: store, types
    sync/    Transport = the sync hook
    trip/    The room's trip (name, days, currency, map center), notes on a day, budgets; formatting
    tags/    Tag colors and the tag filter (store, filter bar)
    place/   Google Maps links: parsing, safe hrefs
    canvas/  Sticky note card, screen <-> world transform
    worker/  WorkerApi: drafting a day, booklet export

  mocks/   Mock room data (members, trip, notes) and a mock WorkerApi, installed at boot

src/ui/             The design system (`@ui/…`): props, slots and events only, no app imports
  styles/        Tokens (colors, type, z-index, motion), base, transitions (ct-morph / ct-fade / ct-slide)
  components/
    chip/        CtChip: a pill, optionally tinted, selected or a toggle
    segmented/   CtSegmented: the pill morphs to the choice
    tab/         CtTabList: the underline slides to the tab; CtTabPanel: content morphs in;
                 CtTabBar: bottom navigation, the highlight slides behind the current item
  composables/   useIndicator: measures the selected child so an indicator can slide to it
  index.ts, types.ts   The public entry and the shared CtOption type
```

## Sync hook

`transport.send(mutation)` in `features/sync/store.ts` is the only way out, and it does nothing yet.
Once the Cloudflare side (Durable Object + WebSocket) exists, connect it by:

1. `useSync().transport = { send: (m) => ws.send(JSON.stringify(m)) }`
2. passing snapshots from the server to `useMembers().apply(members)`, `useTrip().apply(trip)` and `useNotes().apply(notes)`, and setting `useMembers().me`
3. setting `useWorker().api` to calls into the Worker

`src/mocks/index.ts` does the same with mock data, so it shows what a room has to provide.

`note:move` is throttled to every 80ms while dragging.

Temporal values become ISO strings under `JSON.stringify` (`"2026-11-03"`, `"12:30:00"`).
The receiving side gets plain strings, so revive them with `Temporal.PlainDate.from` and friends before calling `apply`.

## Map

- Tiles come from OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`): free, no key.
- Coordinates come from the Google Maps link pasted into the form. Short `maps.app.goo.gl` links need the Worker
  to follow the redirect before `parseMapsUrl` sees them (not implemented yet; see `features/place/google-maps.ts`).
- When there are no coordinates, long-press the map to place the note.
- Google Maps is only an "open" link. There is room for an iframe (Maps Embed API, free, needs a key) on a single note's detail.
