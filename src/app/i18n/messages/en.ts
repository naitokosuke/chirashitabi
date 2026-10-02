/**
 * The source messages, in MessageFormat 2.
 * Every other locale has exactly these ids.
 */
export const en = {
  "common.fitAll": "Fit all",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.dismiss": "Dismiss",

  "nav.label": "Views",
  "nav.canvas": "Canvas",
  "nav.map": "Map",
  "nav.booklet": "Booklet",

  "member.someone": "Someone",

  "color.yellow": "Yellow",
  "color.pink": "Pink",
  "color.mint": "Mint",
  "color.sky": "Sky",
  "color.lilac": "Lilac",
  "color.white": "White",

  "rooms.yours": "Your trips",
  "rooms.none": "No trips yet",
  "rooms.new": "New trip",
  "rooms.name": "Trip name",
  "rooms.namePlaceholder": "Taiwan trip",
  "rooms.firstDay": "First day",
  "rooms.days": "Days",
  "rooms.currency": "Currency",
  "rooms.you": "Your name",
  "rooms.color": "Your color",
  "rooms.create": "Create",
  "rooms.connecting": "Connecting…",
  "rooms.failed": "Could not reach the room.",
  "rooms.retry": "Try again",

  "status.idea": "Maybe",
  "status.fixed": "Confirmed",
  "status.done": "Done",

  "filter.label": "How to filter",
  "filter.dim": "Dim",
  "filter.only": "Only",
  "filter.clear": "× Clear",

  "canvas.undo": "Undo",
  "canvas.duplicate": "Duplicate",
  "canvas.delete": "Delete",
  "canvas.write": "Write a note",
  "canvas.added": "Added “{$title}”",
  "canvas.addedDrag": "Added “{$title}”. Drag it anywhere",

  "note.suggestion": "suggestion",
  "note.adopt": "Adopt",

  "form.titleNew": "New note",
  "form.titleEdit": "Edit note",
  "form.addAnother": "Add another",
  "form.note": "Note",
  "form.notePlaceholder": "Places to go, food to try, anything that comes to mind",
  "form.tags": "Tags",
  "form.tagPlaceholder": "Add a tag…",
  "form.place": "Place",
  "form.mapsPlaceholder": "Paste a Google Maps link",
  "form.pinned": "This drops a pin on the map",
  "form.unpinned": "No coordinates? Long-press on the map view to place it",
  "form.color": "Color",
  "form.save": "Save",
  "form.saveToCanvas": "Save to canvas",
  "form.hint": "It pops up in the middle of where you were looking on the canvas",

  "map.all": "All",
  "map.route": "Route {$date}",
  "map.noPin": `
.input {$count :integer}
.match $count
one {{{$count} note has no place · long-press the map to place}}
*   {{{$count} notes have no place · long-press the map to place}}
`,
  "map.openInGoogleMaps": "Open in Google Maps",

  "shiori.summary": "{$fixed :integer} confirmed · {$total}",
  // follows another message directly; the space before it is part of the English
  "shiori.withMaybes": " ({$total} with maybes)",
  "shiori.mode": "Mode",
  "shiori.read": "Read",
  "shiori.trayTitle": "Notes without a day · {$count :integer}",
  "shiori.trayHint": "Tap to pick a day",
  "shiori.trayEmpty": "Every note has a day",
  "shiori.putOn": "Put “{$title}” on",
  "shiori.later": "Later",
  "shiori.days": "Days",
  "shiori.appendix": "Appendix",
  "shiori.dayHeading": "Day {$n :integer} {#date}{$date}{/date}",
  "shiori.intro": "A line about this day",
  "shiori.introPlaceholder": "A line about this day (shown at the top of the booklet)",
  "shiori.dayEmpty": "Nothing yet. Add some from “Notes without a day” above.",
  "shiori.time": "Time",
  "shiori.removeDay": "Remove day",
  "shiori.anytime": "Anytime",
  "shiori.mapLink": "Map",
  "shiori.ifTime": "If there is time",
  "shiori.draft": "draft",
  "shiori.adoptDraft": "Set times and confirm",
  "shiori.askDraft": "Draft the order and times",
  "shiori.dayTotal": "Budget for the day {$total}",
  "shiori.tagEmpty": "No notes with this tag yet",
  "shiori.export": "Export",
} satisfies Record<string, string>;
