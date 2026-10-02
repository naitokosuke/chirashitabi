# Surface: the booklet (しおり)

Target: `src/app/views/Shiori.vue`. Mode: Operate before the trip (edit), Read on the trip (read).

## Brief

- **Job and audience.** Before the trip, two people put notes on days, set times, confirm or drop them. On the trip, one of them opens the app on a phone, often one-handed, sometimes offline, and needs today's plan in time order within a glance, with a way to open each place in Google Maps.
- **Outcome and proof.** Read mode opens on today's day when the trip is under way (else the first day) and shows today's notes as a strip of stickies in time order. Success: the first viewport is the next thing to do and where it is. Evidence: the mock Taiwan trip and the owner's real room.
- **Selected direction: the paper strip.** A day is a vertical strip of the same sticky notes that live on the canvas, pinned in order, each keeping its own paper color and a slight tilt; a time tab sits at its left edge. Confirmed notes are opaque, maybes are faded and gathered at the strip's end under "if there is time", done ones are stamped. The agent's draft stays a square ivory card. The day's intro is a handwritten line above the strip. Nothing in the booklet is a white tool card any more; tools (tabs, the mode switch, the time input, the badges) stay tools.
- **Scope and boundaries.** One view, both modes, phone-first, no new data; the appendix keeps its checklist shape but on paper. Anti-goals: a new visual world, a timeline, a second typeface, a modal.
- **States and ranges.** 1–60 days, 0–12 notes a day, intro optional (0–1000 chars), titles up to 200 chars, bodies up to 4000 (clamped to 3 lines in read mode), 0–2 members' drafts. Empty day: the strip is an empty pinboard with the tray's hint. Tray empty: "every note has a day".
- **Interaction and layout.** Edit mode keeps the tray → pick a day flow, the status cycle on the badge, the time input in the tab, 日付を外す. Read mode is a list only: time tab, title, body (3 lines), budget, a Google Maps link; a day's budget line at the end. Day tabs show 1日目 … with the date under it. Transitions are the existing morph; the only authored motion is the status stamp settling on a note.
- **Constraints and open decisions.** Japanese and English; 36px targets; contrast per DESIGN.md's Mixed Ink Rule; `Temporal` for today's date in the device's zone. Open: whether "today" should also scroll to the next upcoming time (not in this round).

## Direction contract

THESIS: the booklet is the same paper as the canvas, put in order. It refuses the category's white list of cards with a left stripe.

OWN-WORLD: DESIGN.md's desk: Post-it stocks, Pen Navy ink, Stamp Red only for the title, tools as pills and panels with Ruled Line edges and the gentle tool shadow; stickies with the paper shadow and ±1.5° tilt; the agent's card square and ivory.

STORY: on the trip the reader sees today, in order, and taps a place to open it in Maps; before the trip the editor drags nothing, only picks days and taps badges, and watches the strip fill.

FIRST VIEWPORT (phone, read mode): title row (しおり, mode switch), the day tabs with 1日目 and the date, the day heading, the intro line, then the strip: three to four stickies visible, each with its time tab at the left, title bold, body dimmed, a small Maps link; the first sticky is the next thing to do.

FORM: the paper strip, first of three structures offered through the structured question tool (the paper strip; an ivory page with ruled lines; a horizontal timeline). Seed key: none, `concept-seed` is not available in this text-only skill copy; the choice was the owner's.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
