---
target: src/app/App.vue (canvas, map, booklet, form; mock Taiwan trip)
date: 2026-10-02
run: 3
method: dual-agent (A: design review · B: manual browser measurement; detector not installed)
total_score: 28
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 2
previous: app-shell-2.md (28/40)
---

# Critique: the app shell, run 3

Method: dual-agent (A: design review · B: browser evidence, translucent backgrounds composited, store read after each action). Deterministic scan unavailable: detector not installed. One disagreement between A and B (dimmed map pins) was settled by a third measurement: A was right.

## Design Health Score

| #         | Heuristic                      | Score     | Key issue                                                                       |
| --------- | ------------------------------ | --------- | ------------------------------------------------------------------------------- |
| 1         | Visibility of system status    | 3         | A note written from the map confirms nothing visible; dimmed pins look live     |
| 2         | Match system / real world      | 3         | From the map's stamp (no pin) the button and hint still promise the canvas      |
| 3         | User control and freedom       | 3         | Undo on add and delete; 3.2 s window, unreachable by keyboard                   |
| 4         | Consistency and standards      | 3         | Red wordmark; red Save beside navy 書き出す; gray paper in dark                 |
| 5         | Error prevention               | 3         | The status badge re-sorts the strip under the thumb; dead pins look live        |
| 6         | Recognition rather than recall | 2         | Color/copy/delete still only behind long-press or Shift+F10                     |
| 7         | Flexibility and efficiency     | 3         | Complete keyboard route; Tab visits every card before the filter and the stamp  |
| 8         | Aesthetic and minimalist       | 3         | Readable first look, but 5 of 12 notes start off-screen, the agent's among them |
| 9         | Error recovery                 | 2         | No error, offline or reconnecting state inside a room                           |
| 10        | Help and documentation         | 3         | 書き出す, 提案, メモにする unexplained                                          |
| **Total** |                                | **28/40** | **Good** (run 2: 28, run 1: 23)                                                 |

The run 2 fixes landed; new findings (several of them introduced by those fixes) offset them at the same bar.

## Resolved since run 2

- [P1] pop at the wrong place: resolved (center fixed at the landing point through the animation).
- [P1] filter empties the map silently: partial. The filter row is there, but MapLibre writes inline `opacity: 1` on markers it shows, so 5 of 8 `.pin.dim` stay at full opacity while `pointer-events: none` makes them untappable.
- [P2] first fit too small: resolved for size (scale 0.8, 12px titles); 5 of 12 notes start off-screen.
- [P2] faded papers fade ink: resolved in light; dark-mode maybes mix toward the dark surface (gray paper, price 2.86:1).
- [P2] menu and sheet lose the keyboard: resolved; deleting from the menu drops focus to `body`.
- [P2] form speaks canvas from the map: partial; back says 地図, but from the stamp (no pin) the button and hint still say canvas.

## Design specificity verdict

Authored. The canvas (tilt, author dot, the pop where it lands) and the booklet (level strip, fold, stamp, shared ticks) could not belong to another product. Still generic: the form sheet and the map's pin card. New break: dark-mode maybes violate the Paper Stays Light Rule.

Evidence: 0 font requests, weights {400, 700}; 0 gradient text, 0 side borders, 0 hard shadows in app code; one unicode "×" left (the 「× クリア」 chip label).

## Priority issues

1. **[P1] Writing from the map is silent.** `place()` runs in the canvas under the map; its pop and undo toast play unseen and expire. _Fix:_ move the toast to the shell so every write confirms where it happens ("「…」をキャンバスに貼りました · 取り消す"); from the map without a pin, label the button 貼る and the hint 場所はあとで地図を長押し. _Command:_ clarify.
2. **[P1] Dimmed pins look live but are dead.** MapLibre's inline `opacity: 1` beats `.dim`. _Fix:_ dim the children (`.dot`, `.lbl`) and leave the marker root's opacity alone. _Command:_ harden.
3. **[P2] The status badge reorders the strip under the thumb.** Tapping 候補 → 確定 moves the card (time sort falls back to update time) and the next card's badge lands under the finger. _Fix:_ keep edit-mode order stable (sort by time, then by creation, never by update time). _Command:_ harden.
4. **[P2] The first look hides the agent.** At 375, 5 of 12 notes are off-screen, including the only suggestion. _Fix:_ center the 0.8 view on suggestions and the most recent notes; show the count of the rest on the jump button (全体を表示 · ほか5枚). _Command:_ adapt.
5. **[P2] Dark-mode maybes are gray paper.** The read-mode maybe paper mixes toward `--surface`, which is dark in dark mode; the price is 2.86:1. _Fix:_ mix toward a fixed light stock (#fff), never a themed token. _Command:_ colorize.

## Evidence-only failures (B)

- Chip `.count` spans at opacity .7: 3.22–4.18 light, 3.11–3.79 dark.
- 済み badge on mint 4.41; the done stamp on mint 4.43.
- `.daytotal small` renders at 11.67px (same nested-`small` bug as the summary had).
- Map: the expanded attribution overlaps the jump (96×24) and the stamp (58×24); the pin card overlaps the geolocate control (34×26).
- Reduced motion does not cover the note/pin opacity transitions or MapLibre's easeTo / fitBounds.

## Persona red flags

- **Casey:** the 3.2 s undo window; the badge jumps under the thumb; no confirmation for a write from the map; attribution under the fit button and the stamp; off-screen notes with no hint.
- **Sam:** focus falls to `body` after delete and undo; cards announce only their title; the stamp is last in Tab order after every card.
- **Jordan:** 書き出す / 提案 / メモにする unexplained; the map form still promises the canvas; the active filter's tag is pre-filled into the form silently; 付録 is the fifth tab, off-screen.

## Minor observations

- The white swatch in the card menu is white on white with no edge.
- The add toast runs to four lines at 375 and covers a card.
- Chip counts do not drop while a delete is pending; chips re-sort by count under the finger.
- An inline #tag typed in the note does not show in the tag box until save.
- Returning from 付録, the selected day tab is not scrolled into view; the tab row has no start fade.
- The draft card's buttons are 34px tall.
- An empty time shows "--:--" in edit mode but いつでも in read mode.
- Save is a red primary while Export is a navy primary.

## Questions to consider

- Should a write's feedback belong to the shell rather than the desk, so writing from anywhere confirms where you are?
- Is "faded" a property of the paper (a fixed light stock), never of the desk's theme?
- In edit mode, should the strip sort by status at all, or only by time, with status a stamp that never moves the card?
