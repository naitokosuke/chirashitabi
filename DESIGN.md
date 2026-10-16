---
name: chirashitabi
description: Sticky notes scattered on a desk, becoming a trip
colors:
  desk: "oklch(0.968 0.003 260)"
  desk-dot: "oklch(0.86 0.005 260)"
  tool-white: "#ffffff"
  ink: "oklch(0.23 0.01 260)"
  muted: "oklch(0.48 0.01 260)"
  line: "oklch(0.905 0.004 260)"
  danger: "oklch(0.53 0.19 27)"
  paper-white: "oklch(0.995 0 0)"
  paper-ink: "oklch(0.23 0.01 260)"
  paper-muted: "oklch(0.45 0.01 260)"
  desk-dark: "oklch(0.185 0.004 260)"
  desk-dot-dark: "oklch(0.3 0.005 260)"
  tool-dark: "oklch(0.23 0.005 260)"
  ink-dark: "oklch(0.94 0.004 260)"
  muted-dark: "oklch(0.72 0.008 260)"
  line-dark: "oklch(0.31 0.006 260)"
  danger-dark: "oklch(0.72 0.15 27)"
typography:
  title:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  heading:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  note:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
  caption:
    fontFamily: "Noto Sans JP, Noto Sans CJK JP, Hiragino Sans, Hiragino Kaku Gothic ProN, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  note: "6px"
  control: "10px"
  tab: "12px"
  panel: "14px"
  fab: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  xxl: "20px"
components:
  dock:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.muted}"
    rounded: "22px"
    height: "60px"
  chip:
    backgroundColor: "{colors.tool-white}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.tool-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.tool-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "12px 18px"
  button-fab:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.tool-white}"
    rounded: "{rounded.fab}"
    size: "56px"
  input:
    backgroundColor: "{colors.tool-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  paper:
    component: "CtPaper (src/ui/components/paper)"
    backgroundColor: "the writer's paper: their member color at 28% in paper-white (oklab)"
    textColor: "{colors.paper-ink}"
    typography: "{typography.note}"
    rounded: "{rounded.note}"
    width: "164px"
    body: "12px 12px 0"
    foot: "8px 12px 12px"
  paper-note:
    variant: "note"
  paper-proposal:
    variant: "proposal"
    rounded: "0"
    strip: '20px, paper-ink at 5%, its lower edge 1px dashed paper-ink at 35%, saying "suggestion"'
  paper-print:
    variant: "print"
    width: "220px"
    mount: "16px of the paper round the picture"
    outline: "1px solid paper-ink at 35%, round the picture"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.tool-white}"
    rounded: "{rounded.panel}"
    padding: "10px 14px"
---

# Design System: chirashitabi

## Overview

**Creative North Star: "Graphite on Paper" (紙と鉛筆)**

The screen is a desk, and the desk is neutral: a cool, almost colorless gray with the faint dot grid of graph paper. On it, paper, and each thing on the desk is a thing you could pick up: every sheet is its writer's paper, their color washed into white stock, so whose it is reads off the whole sheet, and its outline says what it is: an idea is a sticky with a soft corner; a picture brought onto the desk (a page's, or a photo of a note's) is a wider print, the picture in a wide mount of the paper and framed in ink, the words under it; the agent's proposals are slips cut square, a perforated strip across the top; words written straight on the desk are lettering with no paper; a cut-out picture is a sticker edged in white. Everything that is not paper is a tool drawn in one ink: white chips and panels on a hairline, and filled ink tiles for putting something new down (writing, and on the canvas a sticker). Color belongs to the paper, and the paper to whoever wrote it; the tools stay graphite so the notes are what you see.

The voice is quiet. One ink, one neutral desk, paper in its writers' colors, and one moment of play when a new note pops onto the desk. This is an Operate surface, two people getting a trip planned, and the tool should disappear into the task. Density is relaxed on the canvas and tighter in the booklet; the memo tab is the note form and nothing else, always open for the next thought.

**Key Characteristics:**

- A desk, not a page: a dotted surface you pan and pinch, with paper on it
- Paper is the only color; chrome is white, hairline and ink
- No accent hue: the "on" state and the one primary action are ink; red appears only when something is destroyed
- No bars: what a view keeps at hand floats on it, and one dock floats over every screen in the same place, so moving between them never moves anything
- Fixed pixel type in the device's own Japanese gothic, never fluid

## Colors

A neutral desk, white tools, one ink, and tinted paper. Nothing in the chrome is cream, warm or tinted: a warm off-white reads as a template's default, and here the paper carries all the warmth there is.

### Ink

- **Ink** (`--ink`, oklch 0.23 0.01 260): all text, every selected state (a chip, the segmented switch's label, the current tab), the write button, the primary button, the toast, focus rings. Ink is the only "on" color.
- **Muted** (`--muted`): secondary text, resting tool labels, hints. At least 4.5:1 on the desk and on white.

### Neutral

- **Desk** (`--bg`) with **Desk Dot** (`--dot`): every full-screen background; the dot grid is only on the canvas.
- **Tool White** (`--surface`): chips, menus, inputs, panels.
- **Line** (`--line`): the 1px hairline edge of every tool.
- **Glass** (`--glass`): what floats over a view (the dock, the booklet's tabs, a sheet's way back): the surface at 72%, the view blurred behind it.
- **Wash** (`--wash`, ink at 6–8%): the segmented switch's track, the current tab's highlight, a hovered menu item.
- Dark theme: the same roles, re-chosen rather than inverted: a near-black desk, a lifted tool gray, light ink. The write button turns light with dark ink on it (`--on-ink`). Every color token is a `light-dark()` pair read through `color-scheme`: the device's theme, until the person picks one with the dock's switch (`data-theme` on the root, remembered on the device).

### Paper

- **Paper White** (`--paper-white`): the one stock. On the dark desk it steps down in lightness so it does not glare; it stays light.
- **A member's paper**: their member color at 28% in Paper White, mixed in oklab (`paperOf` in `features/members/paper.ts`; oklch would swing the hue on its way from white). Every note, suggestion, print, pin and booklet card is drawn on its writer's paper; someone who has left the room leaves white paper. There is no paper to pick: the color a note was given before is still stored and no longer shown.
- **Paper Ink** and **Paper Muted** (`--paper-ink`, `--paper-muted`): text on paper, always dark, in either theme.

### Signal

- **Danger** (`--danger`): the text of a delete, or the fill of a row's way off the list slid out from under it. Nowhere else.
- **Member colors**: a member's paper (above), and their dot or face where a member is named (the home's faces, a trip tag, a to-do, a draft). Never a border or text.

### Named Rules

**The Paper Is the Color Rule.** Tinted surfaces are paper and nothing else. Tags, statuses, links, the stamp, headings and buttons are ink or muted ink.

**The Whose-Paper Rule.** Color says whose; the outline says what. A person's paper has a soft corner, the agent's is cut square, a print has a wide mount; no name or dot is written on paper.

**The One Ink Rule.** There is no accent hue. Selected is ink; primary is an ink fill; a link is ink with an underline.

**The Red Means Gone Rule.** `--danger` is spent on deleting. Not on writing, not on the current tab, not on a heading.

## Typography

**Display Font:** the device's own Japanese gothic (Noto Sans JP / Noto Sans CJK JP on Android, Hiragino Sans on iPhone and Mac, Yu Gothic UI / Meiryo on Windows)
**Body Font:** the same (one voice for everything written, the words on the desk included; nothing is downloaded)

**Character:** A plain modern gothic, Japanese first, the one each phone already speaks. Size and weight carry the hierarchy, never a second family.

### Hierarchy

- **Display** (700, 32px, 1.2): the trip's name on the home view. The only size above the fixed scale's top step, but for text on the desk (24px, scaled like a card).
- **Title** (700, 18px, 1.3): a sheet's or the memo tab's title, the wordmark on the home view.
- **Heading** (700, 18px, 1.35): a day in the booklet, a group on the rooms screen.
- **Body** (400, 16px, 1.5): reading text in the booklet and in forms; 17px in the note field.
- **Note** (700, 15px, 1.4): a sticky's title; its body is Caption in Paper Muted.
- **Label** (700, 13px, 1.3): chips, buttons, the segmented switch, menu items.
- **Caption** (400, 12px, 1.4): a note's body, tags (700), hints, the dock's names, counts.

### Named Rules

**The Fixed Scale Rule.** Sizes are the pixel steps in `tokens.css` (12, 13, 14, 15, 16, 17, 18, 19, 22, and 32 for Display). No `clamp()`, no viewport units.

**The No Download Rule.** Type is never fetched; there is no `@font-face` and no font host (owner's decision, for load time and offline reading on the trip).

## Layout

A full-screen app shell with no bars. Every view takes the whole screen, and what it keeps at hand floats on it: along the top, in a 52px row under the status bar (the canvas's tag chips and its ask for ideas, the map's days, the booklet's day tabs and edit/read switch, a sheet's way back), and at the bottom, the **dock**. A page with nothing floating over it (home, the memo tab, the trips) opens with a large title instead, at the same height on each. The row at the top and the dock's footprint (`--top-clear`, `--dock-clear`) are the same on every view, so moving between views, or between the trips and a trip, moves nothing that stays. Where the trip goes is said on the home view. The app opens on the canvas. Each tab and each open sheet has its own URL: switching tabs replaces the step, a sheet is a step of its own, so the back button closes the sheet, then leaves the room for the list.

The canvas's ask for ideas does not ask at once: it opens a white panel under the top row (14px radius, `--shadow-float`), unfolding down out of its button (from 92% and 10px up, growing from its top end, `--duration-morph` on `--ease-morph`, what is in it settling 60ms later) and folding back up into it, quicker, as it closes with one line of words, "what kind of ideas?", blank for anything, and Close quiet beside Ask in ink; Enter asks too and Escape closes it. A card's toolbar offers "Ideas from this" (not on a sticker, which has no words), which opens the same panel headed by the card's title on one line; those ideas land in a column beside that card instead of in the middle of the desk. The panel closes as it asks, and the button says "Thinking…" until the cards arrive; a failed ask keeps the words for the next try.

Views are built the first time they are opened and then kept: switching only says which one is painted, and nothing reloads (the map keeps its tiles, the booklet its scroll, the canvas its pan and zoom). A hidden view is inert, and takes no part in a View Transition.

Changing tabs cross-fades the kept views as layers (180ms): the one coming up fades in over the one going, which is hidden once it has faded. No snapshot of the screen is taken, so what floats over the views (the dock) is never pictured, scaled or covered on the way; it does not move at all. Other changes of place run through **View Transitions** (`useViewTransition`, `transitions.css`): only named regions morph, everything else renders live. A named region is always a box that clips its own content, since a snapshot is not clipped by its ancestors.

A page whose content is replaced, the booklet's day or its edit/read, never cross-fades: two different pages seen through each other read as a flicker. It **turns** (`usePageTurn`): the tabs and the heading answer the tap at once, the old page clears (120ms), and the new day's pieces (`data-turn`: the intro, each sticky, the draft, the total) are laid down from the top one after another, each rising 10px into place (280ms, 35ms apart, at most eight steps). Under reduced motion, without the API, or with the page hidden, the change simply happens. The note form appears two ways: as the memo tab, a page with a large title like home, and as the one sheet, opened by the write button on the canvas or the map, which slides in over everything with its way back floating at the top; the dock sinks out of the way while a sheet is up.

Content that is read or filled in (the booklet, the form) sits in a 648px column centered on wide screens; the canvas and the map use the whole box. Spacing is a small set of steps (4, 6, 10, 12, 16, 20px), 16px gutters. The write button sits at the bottom end, 16px from the edge and 16px above the dock's footprint, with the sticker's tile 12px over it; the fit button sits at the bottom start, level with its middle.

## Elevation & Depth

Paper lifts; tools barely do. Shadows are neutral (a dark gray, never a hue), offset downward with a soft blur. The four steps are tokens: `--shadow-tool` (a chip resting, a hairline lift), `--shadow-paper` (a sticky on the desk), `--shadow-lift` (a card being dragged, a hovered write button), `--shadow-float` (menus, the toast, the write button). The dark theme uses black at higher alpha.

**The Lift Means Pick-Up Rule.** A card under a finger is lifted off the desk: its shadow falls far and soft (`--shadow-lift`, over its ink frame when it is the one picked), it grows 5% and turns 2° anticlockwise, coming up with one small overshoot (`--ease-spring`) and settling back when let go (`--ease-morph`), both over `--duration-swap`. It never glows. Under reduced motion only the shadow changes.

## Shapes

A person's sticky has a small radius (6px); the agent's suggestion and draft are square (0), so a machine's note is told from a person's by its corners; a print keeps a person's corner and is told by its wide mount. Tools are pills when they are a single row (chips, switches, buttons), panels at 10–14px when they hold several things (inputs 10px, menus, the toast and the tray 14px). The write button is an 18px-radius tile, not a circle. Stickies keep a slight rotation (±2°) on the desk; in the booklet they are level.

## Components

### Dock (`CtDock`)

The app's one menu, floating at the bottom middle 12px above the home indicator, over whatever is up: a pane of glass (`--glass`, blurred and saturated behind), 60px tall, 22px radius, a hairline with a lit top edge, `--shadow-float`. It holds icons only, 40px cells (44px on a wide screen), Muted, the open one in ink. One 4px ink dot under the open one marks it, as a dock marks what is running; choosing another, the dock stays exactly where it is and only the dot slides to it (350ms, `--ease-morph`). In order: the trips (a luggage tag), then, in a room, its five views (home, canvas, memo, map, booklet), then a divider and the theme switch. On the trips screen the room's views fold away (`CtDockGroup`: the column narrows to nothing, 350ms), and they unfold as a trip opens; the dock stays centred, shrinking and growing around them.

Under a mouse it magnifies like a dock: icons within 120px of the pointer grow on a smooth shoulder, the nearest to 1.55×, upward out of the glass so the dock keeps its height, pushing their neighbours aside; letting go, they spring back (`--ease-spring`). A hovered or focused icon shows its name above it in a small ink label. While a sheet is up the dock sinks below the screen's edge and fades, and comes back up after.

### Theme switch

The dock's last icon is the theme that is up: a sun, or a crescent. Pressed, the sun's rays turn and fold into the disc as it swells and is bitten into a crescent (550ms, a spring), and back. Going light, the day spreads over the screen from the icon like ink soaking into paper: a circle with a soft 56px wet edge, growing until it covers the farthest corner (750ms, `cubic-bezier(0.65, 0, 0.35, 1)`). Going dark, night comes in from the edges: the lit screen's circle shrinks into the icon, slow to start and lingering at the end (900ms, `cubic-bezier(0.7, 0, 0.3, 1)`). Both are a View Transition of type `theme` in which nothing else morphs. Under reduced motion the theme simply changes. The pick is remembered on the device and set before the first paint, so it never flashes.

### Tag filter

The canvas's top row is the tag chips. While a tag is picked, two chips appear pinned at the row's end: "only these" (a toggle: off dims the other notes, on hides them) and a dashed "clear". Before a tag is picked neither means anything, so neither is shown.

### Text on the desk

Words set straight on the desk, where a note would be too much: a heading over a pile, a day's label, an arrow's caption. A double click (a double tap) on the bare desk writes there, the caret about where the click landed; a double click on a text box rewrites it in place. Enter or leaving it is done, Shift+Enter starts a new line, Escape gives up; nothing is made from blank words, and a box emptied goes like a deleted card, with the toast's undo. It has no paper, no shadow and no author's dot: the desk's own ink at 24px and 700 (`--text-box-size`), so it reads in either theme, as wide as its longest line up to 560px. Otherwise it is a card: picked with a tap and framed in ink, moved, resized (that is how a heading gets large) and turned with the same handles, duplicated or deleted from its toolbar, which offers Edit in place of the trip's days. The tag filter leaves it be; the map, the booklet and the counts never see it.

### Stickers

A picture stuck straight on the desk, for the fun of it: a subject lifted from a photo on the iPhone, a cut-out. The sticker's tile picks one from the photos: the write button's 56px ink tile, stacked over it, with a peeling sticker in `--on-ink`; on a computer one is also pasted onto the desk (not into words being written) or dropped where it should go. It lands in the middle of the desk (or where it was dropped) a few degrees askew, with the pop and the toast's undo; meanwhile the tile fades to half and is named "Sticking…". It is the picture alone, 160px wide at its own size (`--sticker-size`), its see-through parts kept: no paper and no author's dot, its outline traced by a 2px white edge (`--sticker-edge`, the white paper's color) and a soft shadow that follows the cut, lifting further while it is dragged. A picture with no see-through parts is stuck as the rectangle it is. Otherwise it is a card, as a text box is: picked and framed in ink, moved, resized and turned with the same handles, duplicated or deleted from its toolbar, which has no days. The tag filter leaves it be; the map, the booklet, the counts and Claude's ideas never see it.

### Home

The first tab, shown rather than listed. The trip's name in Display as the large title, its dates and length; a face per member (the initial on their color, deepened to carry white; the one place a member color fills, since the face is about them). Then the days side by side on a white panel, each a stack of its notes drawn as slips of their own paper, maybes faded on a dashed edge, the date and weekday under it. Then one bar of the plan's progress in three inks (confirmed, maybe, no day) with a small legend of counts; the budget in 22px with the maybes in small. The way back to the trip list is the dock's first icon. No row of labels and figures, and no "you".

Under the members, the flights, each a strip of ticket on a white panel: which way and its number, the day (twice when it lands on another), then the route large, each airport with its local time. Under them "旅を編集" opens the trip's settings in place on a white panel: the name, the first day and a stepper for the length, then a fieldset per flight (a dashed button adds one, prefilled on the first or last day), Save in ink and Cancel quiet. Changing the dates says first how many planned notes would fall outside and go back to having no day. In the booklet a day with a flight shows its strip above the day's line.

### Trips (the rooms screen)

The person's trips, as luggage tags, hung one under another in the page column under the wordmark `chirashitabi`, set as the large title. Two groups under Heading: coming up (the trip under way first, then the soonest, the undated last) and been (the most recent first). A tag that is coming up is ink, with a ringed punched hole: the name at 22px, how soon at its far end ("あと 30 日", "明日から", "旅の途中 · 2 日目"), the dates and length, and a foot of member dots (round for a person, square for the agent) with the memo count. A tag that is over is white on a hairline in ink, so it recedes. The whole tag is a link into its trip; hovering lifts it with `--shadow-lift`. A finger slides a tag left to show, behind its end, a red tile the tag's height: "削除" for the owner (restorable), "抜ける" for anyone else (`CtSwipeRow`, as iOS's swipe actions). Past half the tile or flicked, it settles open (`--duration-swap`, `--ease-morph`); pulled past it, it resists; a tap on the tag, a touch anywhere else or a scroll closes it; one tag is open at a time. Where a pointer can hover, beside each tag, a quiet "…" opens the way off the list under it (on a phone only a screen reader finds it), asked once more: the owner's "削除する（30 日間は元に戻せます）" in ink, anyone else's "この旅から抜ける", and Cancel; a deleted trip moves to the shelf of deleted trips at the foot, with its restore.

After the trips coming up hangs a blank tag: the tag's outline dashed, its hole dashed, a plus and "new trip" in Muted. It opens the new trip sheet (`/new`), which slides in like the note form: its way back floating at the top, the title, then the tag the trip will get, drawn live from the fields (the name in the placeholder's place faded until one is typed), then the name, the first day beside a stepper for the days, the currency as chips, your name, and your color as swatches ringed in ink when chosen. The one primary button sits in a footer under the fields, always in reach.

While the list loads, two wash-colored tag shapes hold its place. With no trips, one line of Muted copy invites the first tag above the blank one. A trip that cannot be reached, or a list that does not come, is said once in a white notice with an ink "try again".

### Write button (`CtFab`)

An ink tile, 56px, 18px radius, a 24px plus in `--on-ink`, `--shadow-float`, lifting to `--shadow-lift` on hover. On the canvas and the map. On the canvas the sticker's tile, the same ink tile with a peeling sticker for its glyph, sits 12px over it; otherwise it is the only filled tool on a view.

### Buttons

- **Primary:** ink fill, `--on-ink` label, pill; disabled at 35–40% opacity.
- **Tool button:** Tool White, 1px line, Label in Muted (fit, back, menu items); hover turns the label to ink.
- **Destructive:** a menu item in `--danger` text.
- **Hold button** (`CtHoldButton`, after React Bits' Hold Button): for what is not undone with a tap. Held, it presses in a little and fills from its start edge in its tone (ink, or danger), the fill cut to the button's own round outline and led by a soft rolling wave; what it says turns `--on-ink` as the fill passes over it. Let go, drifted off, or the window left, it drains back (200ms) and nothing happens; full, it acts, rings once in its tone and says what it did. No system tap highlight, callout or menu under the finger. Under reduced motion it does not press in, wave or ring.

### Chips (`CtChip`)

Pill, 36px tall, Tool White on a 1px line, Label in Muted. Selected fills with ink and turns the text `--on-ink`. A count follows at 12px, 60% opacity. Toggle chips announce `aria-pressed`. A "clear" chip has a dashed edge.

### Segmented switch

A wash-colored track; the chosen option is a white pill with a hairline and a tool shadow that slides to it (350ms, `--ease-morph`); the chosen label is ink, the others Muted.

### Sticky note

164px, 6px radius, on its writer's paper, 12px padding; where it came from (a site, with the arrow that means elsewhere) above the title, title in Note, body in Caption (Paper Muted), tags as `#tag` in Paper Muted, its day as a stamp at the end of its foot. No strip, dot or name: the paper says whose it is. A memo with a photo is a print (below). Dimmed to 22% and desaturated when filtered out. Every card on the desk is a cut of `CtPaper`.

A link on paper, and a slip's two actions, aim at a touch 24px across on screen: the target reaches past what is drawn by what the card's scale and the desk's zoom took off it, but only into the room around it (6px; 2px for a link among words), never over the words beside it, the next action or off the paper. Zoomed far out, a card is picked and dragged rather than pressed through.

Handled like an object, as in a native whiteboard. A tap picks it: an ink frame, a round handle above the middle to turn it (Shift snaps to 15°), one at the bottom-end corner to resize it (0.6× to 2.5×, text and picture with it), and its toolbar (the trip's days, duplicate, delete) below, clear of the handles. A second tap soon after (or a double-click) opens it; a drag moves it and picks it; a long press picks it and shows the toolbar; a tap on the bare desk lets go. The handles keep their size on screen whatever the card's scale and the desk's zoom. With the keyboard, Enter opens a focused card, Delete removes it (the toast offers the undo), Esc closes the toolbar, then lets go.

### Suggestion

A slip: 164px, on the agent's paper, cut square (no radius, where every person's paper is rounded); a strip across its top saying "suggestion", its lower edge perforated (dashed). The proposal in Note, five lines of it, all of it once picked. Its two answers, as simple as a swipe: two halves of its foot, 36px tall pills side by side across it inside its padding, 8px apart: each held, not tapped (`CtHoldButton`, 600ms), filling from its start edge: first the primary, a thumb up to keep it as a memo (Paper Ink, filling a step lighter), then the secondary, a thumb down to pass on it (white on a hairline, filling in Paper Muted). Let go early and nothing happens. Named for a screen reader and on hover.

### Print

A memo with a picture (a page's, brought in with its link, or a photo), unlike a sticky on purpose: 220px, a person's 6px corner, on its writer's paper, the picture at 16:9 in an ink-edged frame inside a wide 16px mount of the paper; under it, as on a sticky, the site, the title (two lines), the tags and the day's stamp. A page's own line stays off its print (it is the note's, for the booklet); a photo's memo keeps its words.

### Map pin

The note's writer's paper as the pin's fill, a 2px Paper Ink edge, its title on a white label. A day's route is a dashed Paper Ink line. The tiles are light in both themes. A long press on the map with a finger (500ms) opens the note form pinned at that point; while it is held, a Paper Ink ring fills around the point, so holding visibly does something, and moving or dragging cancels it. With a mouse it is a right click; a held mouse button only drags the map. The form it opens already has the point's Google Maps link; a moment later OpenStreetMap's name for what is there (a shop or a sight, else the street, never a bare house number) names the link and fills an empty title, with "looking up what is here" under the field meanwhile and OpenStreetMap credited after; nothing typed or pasted meanwhile is overwritten. Notes without a place are counted at the top; they get one from the form (a pasted link, or "Find the place"), not from the map.

### Booklet

Its day tabs and edit/read switch float in the top row on glass, aligned to the page's column: the open day is the same raised white pill as the chosen side of the switch, and on a phone the row of days fades out at its end and scrolls the chosen day into view. Everything below keeps to the column's edges: the lead (the trip's sums, the tray, the day's heading) ends in a hairline across the column, not the screen, and the page starts 16px under it. A day is a vertical strip of the same stickies, level, each with a fold of the same paper (lightness only) along its start edge holding the time. Status is one ink in three steps: maybe is a dashed outline, confirmed is filled, done is outlined and the paper is stamped "done" in ink. In read mode the maybes gather under "if there is time" on paper faded toward white. The trip's sums and, in edit mode, the tray of notes without a day (a white panel) sit above the page and do not scroll or turn with it; only the day's page turns. The open day's heading ("1日目 11/3(火)") is the foot of that lead and changes by text morph (`CtTextMorph`): going to the next day, only "2", "4" and the weekday change; the rest of the heading does not move.

### Text morph (`CtTextMorph`)

Text that changes in place without being replaced. The old and new strings are matched character by character (their longest common subsequence; a character in another tone is another character). Shared characters stay and slide to their new place; the others blur and fade out a third of an em upward where they were, and in from a third of an em below where they go (280ms, `--ease-morph`). A screen reader gets the whole text once. Use it where a label's meaning stays and only a part of it changes: a date, a count, a status. The agent's draft is its square, dashed white card.

### Memo tab

The note form, docked as a view: the form's title as the large title, then the same fields and the same "save to canvas" button as the sheet. The note field takes focus whenever the tab comes up. Saving puts the note on the canvas (the toast says so and offers the undo) and empties the form for the next one; the tab itself never shows stickies, only the canvas does.

### Inputs

Tool White, 1px line, 10px radius, 10px 12px padding, Body; labels above in Label, Muted. Focus is a 2px ink ring outside the edge.

### Toast

Ink, 14px radius, `--on-ink` text, centered above the write button's row (at most 480px wide); its action is the same color, underlined.

### The pop

When a note is written over the canvas it appears where the canvas was looking, scaling from 30% with an 8° tilt, overshooting to 108% and settling (500ms, `cubic-bezier(.2, 1.4, .4, 1)`), while an ink ring at half strength expands and fades around it. With the theme switch's ink, one of the two authored moments; under `prefers-reduced-motion` both are off.

## Do's and Don'ts

### Do:

- **Do** keep every tinted surface paper, and write on it in Paper Ink.
- **Do** mark selection and the primary action in ink, and only in ink.
- **Do** float what a view keeps at hand on it, in the top row or above the dock, never in a bar.
- **Do** keep a view mounted once opened and switch by visibility, so nothing reloads or blinks.
- **Do** keep every size on the fixed pixel scale and every transition at 280–350ms with `--ease-morph`.

### Don't:

- **Don't** add an accent hue, a cream or ivory surface, a tinted chrome, or a color per tag.
- **Don't** use red for anything but deleting.
- **Don't** add a bar, a header strip or a bordered title row to a view.
- **Don't** remount a view, or fade it with CSS, when the tab changes; morph through a View Transition.
- **Don't** let anything that holds for the whole view slide with a page that changes under it.
- **Don't** add a second typeface, uppercase tracking, gradient text or an eyebrow label above a heading.
- **Don't** fill the canvas with same-size cards in a grid; stickies keep their scatter and their tilt.
- **Don't** reach for a modal; the form is a full-screen sheet and everything else is inline or a floating menu.
