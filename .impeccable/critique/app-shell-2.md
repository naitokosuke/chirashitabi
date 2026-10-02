---
target: src/app/App.vue (canvas, map, booklet, form; mock Taiwan trip)
date: 2026-10-02
run: 2
method: dual-agent (A: design review · B: manual browser measurement; detector not installed)
total_score: 28
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 2
previous: app-shell.md (23/40)
---

# Critique: the app shell, run 2

Method: dual-agent (A: design review · B: browser evidence). Deterministic scan unavailable: detector not installed; B re-measured the first run's items by hand at 1024×768 and 375×812, light and dark, with canvas-resolved colors.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | A canvas filter silently hides map pins; the pop plays at the world origin |
| 2 | Match system / real world | 3 | From the map, the form speaks of the canvas; an inline #tag appears twice |
| 3 | User control and freedom | 3 | Undo on add and delete, Esc everywhere; the undo window is 3.2 s |
| 4 | Consistency and standards | 3 | Two red headings and a red tab underline against the One Stamp Rule |
| 5 | Error prevention | 3 | Soft delete; the tab bar stays live under an open sheet |
| 6 | Recognition rather than recall | 2 | Color/copy/delete still only behind long-press or Shift+F10; nothing says what 書き出す does |
| 7 | Flexibility and efficiency | 3 | Keyboard route exists; the menu does not take focus |
| 8 | Aesthetic and minimalist | 3 | Fit-all on a phone renders cards at 0.41 scale (6px titles) |
| 9 | Error recovery | 2 | No error state outside the rooms screen |
| 10 | Help and documentation | 3 | Empty desk, add toast, tray, pin state all guide; a suggestion and 書き出す do not |
| **Total** | | **28/40** | **Good** (from 23) |

## Resolved since run 1

- [P0] tray → day: resolved (verified: picker closes, tab switches, count drops, card appears).
- [P1] dark-mode contrast: resolved for every re-measured pair (chips 4.88–6.16 dark, 6.06–8.37 light; tags on paper 5.40–9.15; badges 5.19–5.82; links 5.00–6.31; toast 6.59/12.16). New: the current tab label in light mode is 4.12 on its red-tinted highlight, and faded papers in the booklet drop their ink below 4.5.
- [P1] keyboard path: largely resolved (ink ring on everything, inert layers, no viewport scroll, Esc, Enter, Shift+F10, named swatches). Open: the menu does not take focus; focus is lost when the sheet closes; the tab bar is not inert under a sheet.
- [P2] phone chrome: resolved (nothing under the FAB or jump at 375; chip row fades; room name on its own line). Trade-off introduced: fit-all shrinks cards to 0.41 scale.
- [P2] targets and silent destruction: resolved (36px on every control measured; delete through the undo toast).

## Design specificity verdict

Authored, and now consistently so: the booklet is paper (strip, time fold, stamp, faded maybes, appendix on paper), the map selects in navy and carries the stamp, the dark desk is composed from mixed-ink tokens. Still generic: the form sheet and the map's pin card. Refuse-list hits: 0 colored side borders, 0 gradient text, 0 hard shadows; unicode "×" as an icon in two places.

## Priority issues

1. **[P1] The pop animates at the wrong place.** `@keyframes pop` and `@keyframes ring` set `transform`, which replaces the card's `translate(...)`, so for 500–800 ms the new card and its ring sit at world (0,0) and then jump to the viewport center; on a phone the origin is off-screen and the signature moment is simply absent. *Fix:* animate `scale` and `rotate` as their own properties (or an inner wrapper) and leave the positioning transform alone. *Command:* animate.
2. **[P1] A canvas filter silently empties the map.** Pins obey `tags.visibility` but the map shows no filter state and no clear. *Fix:* show the selected chips and × クリア in the map's top row when a filter is on, and count pins as "#Food の 2 件". *Command:* clarify.
3. **[P2] Fit-all on a phone is too small to read.** Scale 0.41 at 375px: 15px titles render at 6px, suggestion buttons at 34×15. *Fix:* clamp the first fit to a minimum scale (~0.8) and center on the pile instead; keep fit-all for the explicit button. *Command:* adapt.
4. **[P2] Fading papers fades their ink.** `.paper.idea { opacity: .6 }` applies in edit mode (title 4.19, 候補 4.03, body 2.84) and the done paper's `.main` at .55 drops the body to 2.48; the current tab label in light mode is 4.12 on its tinted highlight. *Fix:* fade the paper (saturation, a lighter stock) and keep the ink at full; in edit mode do not fade at all; mix the current tab's red toward ink in light mode. *Command:* colorize.
5. **[P2] The menu and the sheet lose the keyboard.** Shift+F10 opens the menu but focus stays on the card; Esc on the sheet drops focus to `body`; the tab bar is live under a sheet; the menu is wider than `MENU_W` and clips at the right edge. *Fix:* focus the first swatch on open and return focus on close, return focus to the card after the sheet closes, `inert` the tab bar under a sheet, measure the menu after mount. *Command:* harden.
6. **[P2] The form speaks canvas from the map.** Back says キャンバス, the button says キャンバスに貼る, the hint promises the canvas center. *Fix:* label by the originating tab, "貼る" with a hint that depends on the pin. *Command:* clarify.

## Persona red flags

- **Casey:** a 3.2 s undo window makes one glance away permanent; first-mount cards at 6px text; appendix checkboxes forget their state on reload; pin labels overlap in central Taipei.
- **Sam:** the menu does not take focus; focus lost after Esc on the sheet; dimmed cards drop `tabindex` without announcement; the tray's "picking" is a border only; the time input hides its picker glyph.
- **Jordan:** 書き出す is unexplained; 提案 / メモにする unexplained; the appendix tab is off-screen on a phone; the inline #Food appears twice on the saved card.

## Minor observations

- One Stamp Rule: both h1s are red headings; the day-tab underline is a third red.
- Chip counts do not drop while a delete is pending.
- "いつでも" at 900 in the time fold competes with the title; Post-it White papers nearly vanish when faded.
- Map and booklet horizontal rows have no end fade; the attribution sits under the jump and the FAB on a phone (96×24, 58×24 overlap).
- `<small>` in the summary line renders at 11.67px, under the 12px floor.
- Segmented radios are 30px tall inside a 36px pill; the geolocate control is 29px.
- The suggestion's dismiss button uses a 0.5px rgba border, not the Ruled Line; its buttons are weight 600.
- Radii outside the vocabulary: 3px (map swatch), 4px (stamp), 8px (time input), 16px (ring).

## Questions to consider

- If the booklet travels, why does the appendix forget its ticks? Should a check be a note status the whole trip shares?
- The desk filter follows the user to the map but not the booklet. Is a filter a property of the desk, or of the trip?
- The pop is the one authored moment and it fires off-screen on a phone. Keep it on the desk, or move the moment to the toast and the card's shadow settling?
