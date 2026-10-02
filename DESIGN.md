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
  paper-yellow: "oklch(0.95 0.07 100)"
  paper-pink: "oklch(0.935 0.035 12)"
  paper-mint: "oklch(0.94 0.035 165)"
  paper-sky: "oklch(0.935 0.033 245)"
  paper-lilac: "oklch(0.935 0.035 300)"
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
  app-bar:
    backgroundColor: "{colors.desk}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    height: "52px + 48px"
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
  note-card:
    backgroundColor: "{colors.paper-yellow}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.note}"
    rounded: "{rounded.note}"
    padding: "12px"
    width: "164px"
  suggestion-card:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "12px"
    width: "186px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.tool-white}"
    rounded: "{rounded.panel}"
    padding: "10px 14px"
---

# Design System: chirashitabi

## Overview

**Creative North Star: "Graphite on Paper" (紙と鉛筆)**

The screen is a desk, and the desk is neutral: a cool, almost colorless gray with the faint dot grid of graph paper. On it, paper. Ideas are sticky notes in six tinted stocks, scattered at slight angles, each with a small dot saying whose hand it came from. Everything that is not paper is a tool drawn in one ink: white chips and panels on a hairline, and a single filled ink tile for writing. Color belongs to the paper and to nobody else; the tools stay graphite so the notes are what you see.

The voice is quiet. One ink, one neutral desk, one family of paper, and one moment of play when a new note pops onto the desk. This is an Operate surface, two people getting a trip planned, and the tool should disappear into the task. Density is relaxed on the canvas and tighter in the booklet; the memo tab is the note form and nothing else, always open for the next thought.

**Key Characteristics:**

- A desk, not a page: a dotted surface you pan and pinch, with paper on it
- Paper is the only color; chrome is white, hairline and ink
- No accent hue: the "on" state and the one primary action are ink; red appears only when something is destroyed
- One bar, the same on every view: switching views changes what is under it, never where it is
- Fixed pixel type in the device's own Japanese gothic, never fluid

## Colors

A neutral desk, white tools, one ink, and tinted paper. Nothing in the chrome is cream, warm or tinted: a warm off-white reads as a template's default, and here the paper carries all the warmth there is.

### Ink

- **Ink** (`--ink`, oklch 0.23 0.01 260): all text, every selected state (a chip, the segmented switch's label, the current tab), the write button, the primary button, the toast, focus rings. Ink is the only "on" color.
- **Muted** (`--muted`): secondary text, resting tool labels, hints. At least 4.5:1 on the desk and on white.

### Neutral

- **Desk** (`--bg`) with **Desk Dot** (`--dot`): every full-screen background and the app bar; the dot grid is only on the canvas.
- **Tool White** (`--surface`): chips, menus, inputs, panels.
- **Line** (`--line`): the 1px hairline edge of every tool and the app bar's bottom edge.
- **Wash** (`--wash`, ink at 6–8%): the segmented switch's track, the current tab's highlight, a hovered menu item.
- Dark theme (`prefers-color-scheme: dark`, unless `data-theme="light"`): the same roles, re-chosen rather than inverted: a near-black desk, a lifted tool gray, light ink. The write button turns light with dark ink on it (`--on-ink`).

### Paper

- **Yellow, Pink, Mint, Sky, Lilac, White** (`--paper-*`): six stocks at one lightness and an equal, low chroma, so they read as one family. Yellow carries a little more chroma and leans toward green, because at low chroma a warm yellow turns into cream. On the dark desk each steps down in lightness so it does not glare; it stays light.
- **Paper Ink** and **Paper Muted** (`--paper-ink`, `--paper-muted`): text on paper, always dark, in either theme.
- The room stores a paper as one of six hex values (`COLORS` in `notes/types.ts`). The screen paints the theme's token for it (`PAPERS`), so the palette can change without touching stored notes.

### Signal

- **Danger** (`--danger`): the text of a delete. Nowhere else.
- **Member colors**: a member's dot on their notes, suggestions and drafts. A dot, never a fill, a border or text.

### Named Rules

**The Paper Is the Color Rule.** Tinted surfaces are paper and nothing else. Tags, statuses, links, the stamp, headings and buttons are ink or muted ink.

**The One Ink Rule.** There is no accent hue. Selected is ink; primary is an ink fill; a link is ink with an underline.

**The Red Means Gone Rule.** `--danger` is spent on deleting. Not on writing, not on the current tab, not on a heading.

**The Whose-Hand Rule.** A member's color says "by whom" as a small dot, and nothing else.

## Typography

**Display Font:** the device's own Japanese gothic (Noto Sans JP / Noto Sans CJK JP on Android, Hiragino Sans on iPhone and Mac, Yu Gothic UI / Meiryo on Windows)
**Body Font:** the same (one voice for everything; nothing is downloaded)

**Character:** A plain modern gothic, Japanese first, the one each phone already speaks. Size and weight carry the hierarchy, never a second family.

### Hierarchy

- **Title** (700, 18px, 1.3): the trip's name in the app bar, a sheet's title.
- **Heading** (700, 18px, 1.35): a day in the booklet, a group on the rooms screen.
- **Body** (400, 16px, 1.5): reading text in the booklet and in forms; 17px in the note field.
- **Note** (700, 15px, 1.4): a sticky's title; its body is Caption in Paper Muted.
- **Label** (700, 13px, 1.3): chips, buttons, the segmented switch, menu items.
- **Caption** (400, 12px, 1.4): a note's body, tags (700), hints, the tab bar's labels, counts.

### Named Rules

**The Fixed Scale Rule.** Sizes are the pixel steps in `tokens.css` (12, 13, 14, 15, 16, 17, 18, 19, 22). No `clamp()`, no viewport units.

**The No Download Rule.** Type is never fetched; there is no `@font-face` and no font host (owner's decision, for load time and offline reading on the trip).

## Layout

A full-screen app shell: a 64px tab bar at the bottom (plus the home-indicator inset), and above it one box that holds every view. Every view opens with the same **app bar**: a 52px title row (the trip's name, then the view's actions at the end) over a 48px tools row (the canvas's tag chips, the map's day chips, the booklet's day tabs, the memo tab's one-line note on where saved notes go). Both rows keep their height when they hold little or nothing, so the bar is pixel-identical from view to view and only what is under it changes.

Views are built the first time they are opened and then kept: switching only says which one is painted. Nothing slides, fades or reloads between views (the map keeps its tiles, the booklet its scroll, the canvas its pan and zoom). A hidden view is inert. The note form appears two ways: as the memo tab, where it wears the app bar like any view, and as the one sheet, opened by the write button on the canvas or the map, which slides in over everything with a header the height of the app bar's title row.

Content that is read or filled in (the booklet, the form) sits in a 648px column centered on wide screens; the canvas and the map use the whole box. Spacing is a small set of steps (4, 6, 10, 12, 16, 20px), 16px gutters. The write button sits at the bottom end, 16px from both edges; the fit button sits at the bottom start, level with its middle.

## Elevation & Depth

Paper lifts; tools barely do. Shadows are neutral (a dark gray, never a hue), offset downward with a soft blur. The four steps are tokens: `--shadow-tool` (a chip resting, a hairline lift), `--shadow-paper` (a sticky on the desk), `--shadow-lift` (a card being dragged, a hovered write button), `--shadow-float` (menus, the toast, the write button). The dark theme uses black at higher alpha.

**The Lift Means Pick-Up Rule.** Dragging raises the shadow and nothing else; the card does not scale or glow.

## Shapes

A person's sticky has a small radius (6px); the agent's suggestion and draft are square (0) with a dashed hairline inset from the edge, so a machine's note is told from a person's by its corners. Tools are pills when they are a single row (chips, switches, buttons), panels at 10–14px when they hold several things (inputs 10px, menus, the toast and the tray 14px). The write button is an 18px-radius tile, not a circle. Stickies keep a slight rotation (±2°) on the desk; in the booklet they are level.

## Components

### App bar (`CtAppBar`)

The desk's color with a 1px line under it. Title row: the trip's name (Title, ellipsis), actions at the end (the canvas's filter switch, the booklet's edit/read switch, nothing on the memo tab or the map). Tools row: a `CtChipRow` (one scrolling row of chips that fades at its end) or the day tabs, whose underline sits on the bar's own edge.

### Write button (`CtFab`)

An ink tile, 56px, 18px radius, a 24px plus in `--on-ink`, `--shadow-float`, lifting to `--shadow-lift` on hover. On the canvas and the map. It is the only filled tool on a view.

### Buttons

- **Primary:** ink fill, `--on-ink` label, pill; disabled at 35–40% opacity.
- **Tool button:** Tool White, 1px line, Label in Muted (fit, back, menu items); hover turns the label to ink.
- **Destructive:** a menu item in `--danger` text.

### Chips (`CtChip`)

Pill, 36px tall, Tool White on a 1px line, Label in Muted. Selected fills with ink and turns the text `--on-ink`. A count follows at 12px, 60% opacity. Toggle chips announce `aria-pressed`. A "clear" chip has a dashed edge.

### Segmented switch

A wash-colored track; the chosen option is a white pill with a hairline and a tool shadow that slides to it (350ms, `--ease-morph`); the chosen label is ink, the others Muted.

### Tab bar

Four equal columns (canvas, memo, map, booklet), icon over a 12px label in Muted; the current item turns ink and a 12px-radius wash slides behind it.

### Sticky note

164px, 6px radius, one of the six stocks, 12px padding; title in Note, body in Caption (Paper Muted), tags as `#tag` in Paper Muted, an 8px dot of the author's color at the top end. Dimmed to 22% and desaturated when filtered out.

### Suggestion

186px, square, Paper White with a dashed hairline inset 5px; a header of the author's dot and name with "suggestion" in Paper Muted; two pills: adopt (Paper Ink fill) and dismiss (hairline).

### Map pin

The note's own paper as the pin's fill, a 2px Paper Ink edge, its title on a white label. A day's route is a dashed Paper Ink line. The tiles are light in both themes.

### Booklet

A day is a vertical strip of the same stickies, level, each with a fold of the same paper (lightness only) along its start edge holding the time. Status is one ink in three steps: maybe is a dashed outline, confirmed is filled, done is outlined and the paper is stamped "done" in ink. In read mode the maybes gather under "if there is time" on paper faded toward white. The tray of notes without a day is a white panel above the page. The agent's draft is its square, dashed white card.

### Memo tab

The note form, docked as a view: the app bar, then the same fields and the same "save to canvas" button as the sheet. The note field takes focus whenever the tab comes up. Saving puts the note on the canvas (the toast says so and offers the undo) and empties the form for the next one; the tab itself never shows stickies, only the canvas does.

### Inputs

Tool White, 1px line, 10px radius, 10px 12px padding, Body; labels above in Label, Muted. Focus is a 2px ink ring outside the edge.

### Toast

Ink, 14px radius, `--on-ink` text, centered above the write button's row (at most 480px wide); its action is the same color, underlined.

### The pop

When a note is written over the canvas it appears where the canvas was looking, scaling from 30% with an 8° tilt, overshooting to 108% and settling (500ms, `cubic-bezier(.2, 1.4, .4, 1)`), while an ink ring at half strength expands and fades around it. This is the one authored moment; under `prefers-reduced-motion` both are off.

## Do's and Don'ts

### Do:

- **Do** keep every tinted surface paper, and write on it in Paper Ink.
- **Do** mark selection and the primary action in ink, and only in ink.
- **Do** give every view the app bar, with both rows at their fixed height.
- **Do** keep a view mounted once opened and switch by visibility, so nothing reloads or blinks.
- **Do** keep every size on the fixed pixel scale and every transition at 280–350ms with `--ease-morph`.

### Don't:

- **Don't** add an accent hue, a cream or ivory surface, a tinted chrome, or a color per tag.
- **Don't** use red for anything but deleting.
- **Don't** fade, slide or remount a view when the tab changes.
- **Don't** add a second typeface, uppercase tracking, gradient text or an eyebrow label above a heading.
- **Don't** fill the canvas with same-size cards in a grid; stickies keep their scatter and their tilt.
- **Don't** reach for a modal; the form is a full-screen sheet and everything else is inline or a floating menu.
