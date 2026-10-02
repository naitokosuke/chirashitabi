---
name: chirashitabi
description: Sticky notes scattered on a desk, becoming a trip
colors:
  desk: "#f3f5f1"
  desk-dot: "#cfd5cc"
  tool-white: "#ffffff"
  pen-navy: "#1c2238"
  pencil-gray: "#4b5563"
  ruled-line: "#d9ded6"
  stamp-red: "#d7263d"
  jade: "#2e8b6e"
  gold: "#e0a100"
  blue: "#3c6ee0"
  ivory-card: "#faf9f5"
  oat-edge: "#e3dacc"
  slate-ink: "#141413"
  post-it-yellow: "#fff1b8"
  post-it-pink: "#ffd9de"
  post-it-mint: "#d8f0e6"
  post-it-sky: "#dbe7ff"
  post-it-lilac: "#ead9ff"
  post-it-white: "#ffffff"
  stone: "#73726c"
  stone-light: "#9aa09c"
  desk-dark: "#1b1f1c"
  desk-dot-dark: "#2e3430"
  tool-dark: "#262b28"
  pen-dark: "#eef1ec"
  pencil-dark: "#a7aeaa"
  ruled-line-dark: "#3a403c"
typography:
  title:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 900
    lineHeight: 1.3
  heading:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  note:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
  caption:
    fontFamily: "Zen Maru Gothic, Hiragino Maru Gothic ProN, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  note: "6px"
  control: "10px"
  tab: "12px"
  panel: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  xxl: "20px"
components:
  chip:
    backgroundColor: "{colors.tool-white}"
    textColor: "{colors.pencil-gray}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.pen-navy}"
    textColor: "{colors.tool-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.pen-navy}"
    textColor: "{colors.tool-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "12px 18px"
  button-fab:
    backgroundColor: "{colors.stamp-red}"
    textColor: "{colors.tool-white}"
    rounded: "{rounded.pill}"
    size: "58px"
  input:
    backgroundColor: "{colors.tool-white}"
    textColor: "{colors.pen-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  note-card:
    backgroundColor: "{colors.post-it-yellow}"
    textColor: "{colors.pen-navy}"
    typography: "{typography.note}"
    rounded: "{rounded.note}"
    padding: "12px"
    width: "164px"
  suggestion-card:
    backgroundColor: "{colors.ivory-card}"
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px"
    width: "186px"
  toast:
    backgroundColor: "{colors.pen-navy}"
    textColor: "{colors.desk}"
    rounded: "{rounded.panel}"
    padding: "10px 14px"
---

# Design System: chirashitabi

## Overview

**Creative North Star: "Stickies on the Desk" (机の上の付箋)**

The screen is a desk: a soft green-gray surface with the faint dot grid of graph paper, and on it, paper. Ideas are sticky notes in pastel paper colors, scattered at slight angles, each with a small colored dot saying whose hand it came from. The agent's suggestions are a different stock, ivory with an oat edge, so a machine's note is recognizably paper too but never mistaken for a person's. Everything that is not paper is a tool left on the desk: pill-shaped chips and switches, a tab bar at the bottom, a red stamp of a button for writing. Tools are drawn with thin ruled lines and sit flat; paper lifts.

The voice is warm and paper-like. Rounded letterforms, pastel stock, rounded corners everywhere a hand would touch, and one moment of play when a new note pops onto the desk. Beyond that moment the interface stays quiet: this is an Operate surface, two people getting a trip planned, and the tool should disappear into the task. Density is relaxed on the canvas and tighter in the booklet, where a day is a list to be read on a phone.

**Key Characteristics:**

- A desk, not a page: a dotted surface you pan and pinch, with paper on it
- Paper colors are the only saturated fills; chrome is white, line and navy
- One accent, stamp red, spent on the few things that start an action
- Pills for tools, soft small radii for paper, soft offset shadows only on what lifts
- Rounded Japanese-first typography in a fixed pixel scale, never fluid

## Colors

Pastel paper on a green-gray desk, written in navy ink, with a red stamp for the one thing to do next.

### Primary

- **Stamp Red** (#d7263d): the write button, the current tab's text and the tint behind it, delete. It starts things or warns; it never decorates. Also the default color of the second member.

### Secondary

- **Pen Navy** (#1c2238): all ink. Text, the selected state of chips and the segmented switch, the primary button, the toast. Navy is the "on" color for tools, so red can stay rare.
- **Member colors** (Blue #3c6ee0, Stamp Red #d7263d, Jade #2e8b6e, Gold #e0a100 and the others a person picks): each member's signature, seen as the dot on their notes, the dot on a suggestion, and the tint of tags they are filtering on. A member color may fill a chip when that chip is about them.

### Tertiary

- **Post-it Yellow** (#fff1b8), **Post-it Pink** (#ffd9de), **Post-it Mint** (#d8f0e6), **Post-it Sky** (#dbe7ff), **Post-it Lilac** (#ead9ff), **Post-it White** (#ffffff): the six paper stocks a note can be. Always light, in both themes; paper does not go dark. Ink on paper is always Pen Navy.
- **Ivory Card** (#faf9f5) with **Oat Edge** (#e3dacc) and **Slate Ink** (#141413): the agent's suggestion card. Warmer and plainer than a sticky, with a visible edge, so a suggestion reads as a different kind of paper.

### Neutral

- **Desk** (#f3f5f1) with **Desk Dot** (#cfd5cc): the canvas and every full-screen background; the dot grid is only on the canvas.
- **Tool White** (#ffffff): chips, switches, menus, inputs, the tab bar.
- **Ruled Line** (#d9ded6): the 1.5px edge of every tool.
- **Pencil Gray** (#4b5563): secondary text and the resting color of tool labels.
- **Stone** (#73726c) and **Stone Light** (#9aa09c): the quietest text (hints, "suggestion", empty states) and the color of nobody.
- Dark theme (`prefers-color-scheme: dark`, unless `data-theme="light"`): Desk becomes #1b1f1c, Desk Dot #2e3430, Tool White #262b28, Pen Navy #eef1ec, Pencil Gray #a7aeaa, Ruled Line #3a403c. Paper, member colors and Stamp Red do not change.

### Named Rules

**The Paper Stays Light Rule.** A note's background is one of the six stocks and is never themed; the desk and the tools change with the theme, the paper on them does not.

**The One Stamp Rule.** Stamp Red appears where an action begins (the write button, the current tab) or where something is destroyed. Never as a border, a heading color or a decoration.

**The Whose-Hand Rule.** A member's color says "by whom" and nothing else: the dot on a card, the dot by a suggestion, the tint of a tag chip. It never fills a surface that is not about that member.

## Typography

**Display Font:** Zen Maru Gothic (with Hiragino Maru Gothic ProN, system-ui)
**Body Font:** Zen Maru Gothic (same family; one voice for everything)

**Character:** A rounded gothic, Japanese first, with English set in the same face. Headings are the same face at 900; the weight carries the hierarchy, never a second family. The round terminals are the warmth; nothing else needs to be decorative.

### Hierarchy

- **Title** (900, 19px, 1.3): the wordmark `chirashitabi` and a sheet's title (new note, the booklet's day heading).
- **Heading** (700, 17–18px, 1.35): section headings inside a view (a day in the booklet, a group on the rooms screen).
- **Body** (400, 16px, 1.5): reading text in the booklet and in forms.
- **Note** (700, 15px, 1.4): a sticky's title; its body is Caption in Pencil Gray.
- **Label** (700, 13px, 1.3): chips, buttons, the segmented switch, menu items (14px when a menu needs the room).
- **Caption** (400, 12px, 1.4): a note's body, tags (700), hints, the tab bar's labels, counts (11px).

### Named Rules

**The Fixed Scale Rule.** Sizes are the pixel steps in `tokens.css` (11, 12, 13, 14, 15, 16, 17, 18, 19, 22). No `clamp()`, no viewport units; this is a tool viewed at arm's length on a phone.

**The Weight Carries It Rule.** Hierarchy comes from 400 / 700 / 900 in one family. A second family, uppercase tracking or gradient text is not in the vocabulary.

## Layout

A full-screen app shell: the active view fills the screen above a 64px bottom tab bar (plus the home-indicator inset). The canvas is a pannable, pinchable world of absolutely positioned cards over a 22px dot grid; the map and the booklet morph in over it so the canvas keeps its position. The note form and the rooms screen are full-screen sheets.

Spacing is a small set of steps (4, 6, 10, 12, 16, 20px). Tools keep 6px between items and 12px of inner horizontal padding; sheets use 12–20px gutters. Touch targets are at least 36px tall (chips) and the primary ones 40–58px. The floating write button sits at the bottom right of the canvas, in the thumb zone, 16px from the edge. Responsive behavior is structural: the layout is phone-first and simply has more desk on a laptop.

## Elevation & Depth

Lifted. A thing on the desk that can be picked up casts a soft, offset shadow in the ink's own color; the desk and the ruled edges are flat. This is the committed direction: paper (notes, suggestions) and anything that floats over the desk (menus, the toast, the write button, the card drag) lift today; chips, the segmented switch, inputs and sheets still sit on their 1.5px line alone and are to be lifted gently in the same vocabulary.

### Shadow Vocabulary

- **Resting paper** (`box-shadow: 0 3px 10px rgba(28, 34, 56, 0.14)`): a sticky on the desk.
- **Lifted paper** (`box-shadow: 0 14px 28px rgba(28, 34, 56, 0.28)`): a card while it is dragged.
- **Floating tool** (`box-shadow: 0 8px 20px rgba(28, 34, 56, 0.2)`): the card menu; the toast at `0 6px 18px / 0.3`.
- **The stamp** (`box-shadow: 0 6px 16px rgba(215, 38, 61, 0.35)`): the write button's shadow is tinted with its own red.

### Named Rules

**The Ink Shadow Rule.** Shadows are Pen Navy at low alpha, offset downward with a soft blur. Never black, never a zero-offset halo, never a hard block.

**The Lift Means Pick-Up Rule.** Dragging raises the shadow and nothing else; the card does not scale or glow.

## Shapes

Two families of corner. Paper has a small radius (6px for a sticky, 10px for a suggestion), the way a cut sheet does. Tools are pills (999px) when they are a single row (chips, switches, buttons, the jump control), and softly rounded panels (10–14px) when they hold several things (menu 14px, toast 14px, inputs 10px, tab highlight 12px). The write button is a circle. Every tool is edged with a 1.5px Ruled Line unless it is filled; a filled tool has no edge. Stickies sit at a slight rotation (±2°) that is theirs for life, so the desk never looks like a grid.

## Components

### Buttons

- **Shape:** pill (999px) for text buttons; a 58px circle for the write button.
- **Primary:** Pen Navy fill, Tool White label, 12px 18px padding; disabled at 40% opacity.
- **Write (FAB):** Stamp Red fill, white glyph, red-tinted shadow, bottom-right of the canvas.
- **Tool button:** Tool White fill, 1.5px Ruled Line, Label type in Pencil Gray (the jump control, menu items); a destructive menu item is Stamp Red text.
- **Hover / Focus:** color and background transition over 280ms; focus rings are currently the browser's and are to be drawn in Pen Navy.

### Chips

- **Style:** pill, 36px tall, Tool White with a Ruled Line edge, Label type in Pencil Gray; a `--tint` (a member or tag color) colors the text.
- **State:** selected fills with the tint (or Pen Navy) and turns the text white, edge gone. A count sits after the label at 11px, 70% opacity. Toggle chips announce `aria-pressed`.

### Segmented switch

- **Style:** a Tool White pill with a Ruled Line edge; a Pen Navy pill indicator slides to the chosen option (350ms, `--ease-morph`), the chosen label turns Desk-colored.

### Tab bar

- **Style:** three equal columns, icon over a 12px label, Pencil Gray at rest; the current item turns Stamp Red and a 12px-radius highlight of red at 12% over Tool White slides behind it.

### Cards / Containers

- **Sticky note:** 164px wide, 6px radius, one of the six stocks, 12px padding; title in Note type, body in Caption (Pencil Gray), tags as `#tag` in the tag's color, a 9px dot of the author's color at the top right. Resting-paper shadow; lifted while dragged; dimmed to 22% and desaturated when filtered out.
- **Suggestion:** 186px wide, 10px radius, Ivory Card with a 1px Oat Edge, Slate Ink; a header of the author's dot and name with "suggestion" in Stone at the end, the text at 400, then two pill buttons: adopt (filled with the author's color) and dismiss (hairline edge).
- **Menu:** Tool White, 14px radius, 6px padding, Ruled Line edge, floating-tool shadow; items are 40px pills.
- **Toast:** Pen Navy, 14px radius, text in Desk color, the undo action in Post-it Pink.

### Inputs / Fields

- **Style:** Tool White, 1.5px Ruled Line, 10px radius, 10px 12px padding, Body type; labels above in Label size, Pencil Gray.
- **Focus:** browser default today; to be a Pen Navy edge.

### Navigation

- The bottom tab bar (above) is the only navigation; the back control on a sheet is an icon-and-word button in the sheet's header.

### The pop

When a note is written it appears at the center of where the canvas was looking, scaling from 30% with an 8° tilt, overshooting to 108% and settling (500ms, `cubic-bezier(.2, 1.4, .4, 1)`), while a red ring expands and fades around it. This is the one authored moment; under `prefers-reduced-motion` both are off.

## Do's and Don'ts

### Do:

- **Do** keep paper light in both themes and write on it in Pen Navy.
- **Do** spend Stamp Red on at most one or two things per screen: the thing that starts, the thing that destroys.
- **Do** give a member's color exactly one meaning: whose.
- **Do** make tools pills and panels with a 1.5px Ruled Line, or a solid Pen Navy fill, never both.
- **Do** keep every size on the fixed pixel scale and every transition at 280–350ms with `--ease-morph`.
- **Do** cast shadows in Pen Navy at low alpha, offset down, when something lifts; lift chips, switches and sheets gently in the same vocabulary.

### Don't:

- **Don't** add a second typeface, uppercase tracking, gradient text or an eyebrow label above a heading.
- **Don't** theme a sticky's background or draw it with a hard offset shadow.
- **Don't** use a member color as a surface, border or heading color outside of "by whom".
- **Don't** fill the canvas with same-size cards in a grid; stickies keep their scatter and their tilt.
- **Don't** reach for a modal; the app's sheets are full-screen and everything else is inline or a floating menu.
