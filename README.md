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
```

## Layout

```
src/main.ts, App.vue, style.css   Boot and view switching (the canvas stays mounted underneath)
src/notes/     The notes domain: Pinia store (tags, filter state, Transport = the sync hook), types, seed data
src/canvas/    The canvas: pan / pinch / drag / long-press, filter bar, cards, screen <-> world transform (viewport.ts)
src/form/      Full-screen note form (new / edit, Google Maps link -> coordinates)
src/map/       MapLibre + OpenFreeMap: pins, tag filtering, a day's route, long-press to add; Maps URL parsing
src/shiori/    The booklet (edit / read, appendix, Claude's draft)
```

## Sync hook

`transport.send(mutation)` in `notes/store.ts` is the only way out, and it does nothing yet.
Once the Cloudflare side (Durable Object + WebSocket) exists, connect it by:

1. `transport.value = { send: (m) => ws.send(JSON.stringify(m)) }`
2. passing snapshots from the server to `store.apply(notes)`

`note:move` is throttled to every 80ms while dragging.

Temporal values become ISO strings under `JSON.stringify` (`"2026-11-03"`, `"12:30:00"`).
The receiving side gets plain strings, so revive them with `Temporal.PlainDate.from` and friends before calling `apply`.

## Map

- Tiles come from OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`): free, no key.
- Coordinates come from the Google Maps link pasted into the form. Short `maps.app.goo.gl` links need the Worker
  to follow the redirect before `parseMapsUrl` sees them (not implemented yet; see `map/google-maps.ts`).
- When there are no coordinates, long-press the map to place the note.
- Google Maps is only an "open" link. There is room for an iframe (Maps Embed API, free, needs a key) on a single note's detail.
