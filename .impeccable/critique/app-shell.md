---
target: src/app/App.vue (canvas, map, booklet, form; mock Taiwan trip)
date: 2026-10-02
method: dual-agent (A: design review · B: manual browser measurement; detector not installed)
total_score: 23
max_score: 40
na_heuristics: ""
p0_count: 1
p1_count: 2
---

# Critique: the app shell

Method: dual-agent (A: design review · B: browser evidence). Deterministic scan unavailable: detector not installed; B measured contrast, tap targets, focus, type, shapes, states and layout by hand in a fresh tab at 1024×768 and 375×812, light and dark.

## Design Health Score

| #         | Heuristic                      | Score     | Key issue                                                                                              |
| --------- | ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of system status    | 3         | Tray → day gives no feedback; delete is silent                                                         |
| 2         | Match system / real world      | 3         | "薄く / だけ" has no noun; swatches announced as hex                                                   |
| 3         | User control and freedom       | 2         | Undo only for the last add; no confirm or undo on delete; Esc does not close the sheet                 |
| 4         | Consistency and standards      | 2         | Map day chips select in Stamp Red; map card has a 6px colored left border; input radius 12 vs token 10 |
| 5         | Error prevention               | 2         | One-tap delete; new note lands on whatever is at center                                                |
| 6         | Recognition rather than recall | 2         | Color/duplicate/delete and writing from the map are long-press only                                    |
| 7         | Flexibility and efficiency     | 2         | Inline #tags, "続けて書く", ctrl+wheel; no keyboard path to the card menu                              |
| 8         | Aesthetic and minimalist       | 3         | Canvas is quiet; on a phone the FAB and the jump button sit on cards                                   |
| 9         | Error recovery                 | 2         | No error state anywhere; a non-Maps URL fails silently                                                 |
| 10        | Help and documentation         | 2         | Good inline hints; nothing explains long-press, 薄く/だけ, or a suggestion                             |
| **Total** |                                | **23/40** | **Acceptable**                                                                                         |

## Design specificity verdict

Authored for this product. The canvas is unmistakably the desk from DESIGN.md: dot grid, six paper stocks at a tilt, the author's dot, the ivory suggestion stock, the red stamp. The world thins as the trip moves on: the booklet's day items are white tool cards with 1.5px lines, not paper; the map's selection is red; the form is a competent stacked form. The product's own principle says the booklet is what gets read on the trip, and it is the least designed screen.

Deterministic scan: unavailable (no detector). Manual evidence found: 1 refuse-list hit (`border-left: 6px solid var(--card)` in Map.vue), 0 gradient text, 0 hard or zero-offset author shadows, unicode "×" used as an icon twice, no author `:focus-visible` rule anywhere, no hover rule anywhere, no loading or error state anywhere.

## Overall impression

The write moment is the product: tap the red stamp, type one field, the card pops onto the desk with a ring and a toast. Everything that follows is solid engineering wearing a thinner coat: contrast that was never re-derived for dark mode, tools that give no feedback on hover or focus, a booklet that forgot it is paper, and one task (putting a note on a day from the tray) that did nothing when tried.

## What's working

- The sticky metaphor is executed with discipline: paper stays light in dark mode, navy ink, a 9px author dot, a per-card tilt, ivory suggestion stock with "提案" in Stone.
- Note capture is one field (`title\nbody #tag`), autofocused, save disabled until there is text, "続けて書く" to keep going.
- Filtering is spatial: non-matching cards dim to 22% and desaturate on the desk, and the map applies the same rule to pins.

## Priority issues

1. **[P0] Putting a note on a day from the booklet's tray did nothing.** Edit mode, pick "Smoothie House shaved ice", tap "11/4": tray count unchanged, picker stays open, no toast, no console error. This is the booklet's primary task. _Fix:_ reproduce against the mock store first (the handler, the day match, `Temporal.PlainDate.equals`), then close the picker, switch to that day's tab and toast "11/4 に置きました". _Command:_ harden.
2. **[P1] Dark mode fails contrast on the tools.** Measured: tag chips 2.13–3.27:1 (all eight), the current tab label 2.90:1, the h1 3.36:1, the toast's undo link ~1.1:1 (pink on inverted ink). In light mode too: #Jiufen chip 4.40:1, tags on paper 3.40–4.20:1 (#Jiufen on pink, #Sweets on yellow, #Packing on mint), 採用 on the agent's color 3.12:1, the 確定 badge 2.27:1, the jade map links 4.17:1. _Fix:_ derive tag and member text colors per surface with `color-mix` toward the surface's ink (a dark ramp for the dark desk; a deeper ramp on pastel paper), give the toast's action an ink-derived color, and move 確定's gold to an outline-with-ink-text badge. _Command:_ colorize, then audit.
3. **[P1] Keyboard and screen-reader path is broken.** No author focus ring anywhere (UA orange `outline: auto`), the tag input has `outline: none`; Tab enters the world first and focusing an off-screen card scrolls the `overflow: hidden` viewport (49.5px) and desyncs the transform; the canvas stays reachable under the form, map and booklet (not `inert`); swatches are labelled by hex; Esc does nothing; the long-press menu has no keyboard route. _Fix:_ a Pen Navy `:focus-visible` ring in `base.css`, `inert` on covered layers, keep the viewport's scrollTop at 0 on focus, named color labels, Esc closes a sheet, a keyboard route to the card menu. _Command:_ harden.
4. **[P2] On a phone the chrome sits on the content.** The FAB covers a card, the jump button covers a suggestion's 採用/見送る and the map's attribution, four cards start off-screen with no edge hint, and the header crams wordmark + room + segmented into 351px. _Fix:_ fit-all on first mount below ~600px, a soft edge fade on the horizontal chip row, a reserved lane for the FAB/jump above content, and the room name on its own line when narrow. _Command:_ adapt.
5. **[P2] Small targets and silent destruction.** 日付を外す 60×18, 確定/候補 badge 44×22, menu swatches 28×28, "続けて書く" 13×13, suggestion buttons 48×31, map card 編集 26×20 and × 15×27; delete has no confirm and no undo; the menu covers its own card. _Fix:_ 36px minimum for every control that is tapped, route delete through the add toast's undo, open the menu below the card. _Command:_ clarify (targets, copy) with polish.

## Persona red flags

- **Casey (one-handed, distracted):** the FAB on the Smoothie House card; 日付を外す at 18px tall; swatches at 28px; writing from the map is long-press only; the "× クリア" chip appearing shifts the row under the thumb; chips re-sort by count after a save, so #Food moved.
- **Sam (keyboard, screen reader):** no visible focus of the system's own; focus-scroll desync on the canvas; the canvas is reachable under sheets; swatches read as "#fff1b8"; the tray's "picking" state is a border only; 確定 is a gold fill plus a word, but the item's outline is color-only; the menu is unreachable by keyboard.
- **Jordan (first time):** "薄く / だけ" with no noun; no hint that long-press exists; the Claude card says 提案 but nothing says what 採用 does; "続けて書く" is a 13px checkbox with no explanation; after saving, "drag it where you like" is the only instruction.

## Minor observations

- The map day chips fill with Stamp Red for selection, against the One Stamp Rule; the canvas and booklet select in navy.
- The map card's 6px colored left border reads as a status stripe (refuse-list hit).
- Form inputs use a 12px radius; the token is 10px. The booklet's time input uses 8px, the ring 16px.
- 11px text (chip counts, pin labels, nested small) sits below the 12px caption step; pin labels truncate at 120px.
- The map card's meta line renders "#FoodNT$70011/3 12:30": three spans with no separator.
- The toast at 375px wraps to three lines and its undo button becomes a 24px-wide column of single glyphs.
- No hover rule exists on any control; the disabled submit keeps `cursor: pointer`.
- The booklet's edit-mode body runs to 132ch on a desktop; read mode to 119ch.
- `::selection` and the caret are unstyled.
- Dark mode: the Liberty tiles stay light inside dark chrome.

## Questions to consider

- If the booklet is what gets read on the trip, why is it the one screen that is not paper? Could a day be a strip of stickies pinned in order?
- The map's only write affordance is a hidden long-press. Should the red stamp follow the user to every tab?
- Dark mode keeps paper light by rule, but every tool around it lost its contrast. Is a dark desk worth a second palette, or should the desk simply stay light?
