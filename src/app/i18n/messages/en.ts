/**
 * The source messages, in MessageFormat 2.
 * Every other locale has exactly these ids.
 */
export const en = {
  "common.fitAll": "Fit all",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.dismiss": "Dismiss",

  "nav.label": "Menu",
  "nav.home": "Home",
  "nav.canvas": "Canvas",
  "nav.memo": "Memo",
  "nav.map": "Map",
  "nav.booklet": "Booklet",
  "nav.trips": "All trips",
  "theme.toDark": "Go dark",
  "theme.toLight": "Go light",

  "member.someone": "Someone",

  "color.yellow": "Yellow",
  "color.pink": "Pink",
  "color.mint": "Mint",
  "color.sky": "Sky",
  "color.lilac": "Lilac",
  "color.white": "White",

  "rooms.coming": "Coming up",
  "rooms.been": "Been there",
  "rooms.none": "No trips yet. Write a tag to start the first one.",
  "rooms.loading": "Looking up your trips…",
  "rooms.listFailed": "Could not load your trips.",
  "rooms.inDays": `
.input {$count :integer}
.match $count
one {{In {$count} day}}
*   {{In {$count} days}}
`,
  "rooms.tomorrow": "Tomorrow",
  "rooms.during": "On the trip · day {$count :integer}",
  "rooms.undated": "No dates",
  "rooms.memos": `
.input {$count :integer}
.match $count
one {{{$count} note}}
*   {{{$count} notes}}
`,
  "rooms.new": "New trip",
  "rooms.name": "Trip name",
  "rooms.namePlaceholder": "Taiwan trip",
  "rooms.firstDay": "First day",
  "rooms.days": "Days",
  "rooms.fewer": "One day fewer",
  "rooms.more": "One day more",
  "rooms.dates": "Dates",
  "rooms.pickLast": "Now pick the last day",
  "rooms.prevMonth": "Previous month",
  "rooms.nextMonth": "Next month",
  "rooms.currency": "Currency",
  "rooms.color": "Your color",
  "rooms.create": "Make this trip",
  "rooms.creating": "Making it…",
  "rooms.createFailed": "Could not create the trip. Try again.",
  "rooms.connecting": "Opening {$name}…",
  "rooms.connectingUnnamed": "Opening the trip…",
  "rooms.failed": "Could not reach the trip.",
  "rooms.retry": "Try again",
  "rooms.invitations": "Invitations",
  "rooms.invited": "You are invited",
  "rooms.join": "Join",
  "rooms.joining": "Joining…",
  "rooms.decline": "Decline",
  "rooms.joinFailed":
    "Could not join: the invitation was withdrawn, or you are in as many trips as you can be.",
  "rooms.declineFailed": "Could not decline. Try again.",
  "rooms.deleted": "Deleted trips",
  "rooms.restoreUntil": "Can be restored until {$date}",
  "rooms.restore": "Restore",
  "rooms.restored": "Restored",
  "rooms.purge": "Delete forever",
  "rooms.purged": "Deleted",
  "rooms.hold": "Press and hold",
  "rooms.purgeFailed": "Could not delete the trip for good. Try again.",
  "rooms.delete": "Delete",
  "rooms.leave": "Leave",
  "rooms.restoreFailed": "Could not restore the trip. Try again.",

  "room.reconnecting": "Connecting… showing the room as of {$time}",
  "room.unreachable": "Offline · as of {$time}",
  "room.refused": "The room did not take a change, so it was undone",
  "room.gone.removed": "You were removed from the trip",
  "room.gone.left": "You left the trip",
  "room.gone.deleted": "The trip was deleted",

  "trip.edit": "Edit trip",
  "trip.save": "Save",
  "trip.dropped":
    "{$count :integer} planned notes fall outside the new dates and go back to having no day",
  "flight.out": "There",
  "flight.back": "Home",
  "flight.number": "Flight",
  "flight.from": "From",
  "flight.to": "To",
  "flight.departs": "Departs",
  "flight.arrives": "Arrives",
  "flight.localTime": "Each time in its own airport's local time, as on the ticket.",
  "flight.remove": "Remove this flight",
  "flight.addOut": "Add the flight there",
  "flight.addBack": "Add the flight home",

  "stay.title": "Stays",
  "stay.name": "Where",
  "stay.checkIn": "First night",
  "stay.nights": "Nights",
  "stay.link": "Google Maps link",
  "stay.linkHint": "With a link, each day's route on the map starts and ends here.",
  "stay.add": "Add a stay",
  "stay.remove": "Remove this stay",
  "stay.when": `
.input {$count :integer}
.match $count
one {{From {$date} · {$count} night}}
*   {{From {$date} · {$count} nights}}
`,
  "stay.tonight": "Tonight",
  "stay.open": "Open in Google Maps",

  "people.title": "Members",
  "people.owner": "Owner",
  "people.you": "You",
  "people.email": "Their e-mail address",
  "people.invite": "Invite",
  "people.inviting": "Inviting…",
  "people.inviteHint":
    "They log in with this address; add it to the Cloudflare Access allow list too.",
  "people.inviteFailed": "Could not invite: already invited, already in, or the trip is full.",
  "people.pending": "Waiting for an answer",
  "people.uninvite": "Withdraw",
  "people.full": "A trip holds {$count :integer} people",
  "people.remove": "Remove",
  "people.removeConfirm": "Remove this person",
  "people.leave": "Leave this trip",
  "people.leaveConfirm": "Leave for good",
  "people.delete": "Delete this trip",
  "people.deleteConfirm": "Delete (restorable for {$count :integer} days)",
  "people.cancel": "Cancel",
  "people.failed": "That did not go through. Try again.",
  "people.loadFailed": "Could not load the members",

  "status.idea": "Maybe",
  "status.fixed": "Confirmed",
  "status.done": "Done",

  "filter.only": "Only these",
  "filter.clear": "× Clear",
  "filter.none": "Write a #tag on a note to filter by it here",

  "home.days": "{$count :integer} days",
  "home.day": "{$date}: {$count :integer} notes",
  "home.fixed": "Confirmed",
  "home.maybe": "Maybe",
  "home.loose": "No day",
  "home.budget": "Budget",
  "home.trips": "All trips",

  "canvas.undo": "Undo",
  "canvas.text": "Text on the desk",
  "canvas.duplicate": "Duplicate",
  "canvas.delete": "Delete",
  "canvas.day": "Day",
  "canvas.noDay": "No day",
  "canvas.write": "Write a note",
  "canvas.added": "Added “{$title}”",
  "canvas.addedAway": "Added “{$title}” to the canvas",
  "canvas.addedDrag": "Added “{$title}”. Tap to resize, turn or recolor it; double-tap to edit",
  "canvas.deleted": "Deleted “{$title}”",
  "canvas.empty":
    "An empty desk. Tap + to scatter the first idea, or double-click to write on the desk itself",
  "canvas.askIdeas": "Ask for ideas",
  "canvas.thinking": "Thinking…",
  "canvas.ideasAdded": `
.input {$count :integer}
.match $count
one {{Claude left {$count} idea here}}
*   {{Claude left {$count} ideas here}}
`,
  "canvas.noIdeas": "Claude had nothing new to add",
  "canvas.ideasFailed": "The ideas did not come back. Ask again.",
  "canvas.ideasLimit": "That is all Claude can do today. Ask again tomorrow.",
  "canvas.ideasTripLimit": "This trip has used all it can ask Claude for.",

  "note.suggestion": "suggestion",
  "note.adopt": "Make it a note",

  "form.titleNew": "New note",
  "form.titleEdit": "Edit note",
  "form.addAnother": "Add another",
  "form.note": "Note",
  "form.notePlaceholder": "Places to go, food to try, anything that comes to mind",
  "form.tags": "Tags",
  "form.suggestTags": "Suggest tags",
  "form.newTag": " new",
  "form.tagsAsking": "Looking at the note…",
  "form.tagsNone": "No tag fits this one yet.",
  "form.tagsFailed": "The tags did not come back. Ask again.",
  "form.tagsLimit": "That is all the suggestions for today. Ask again tomorrow.",
  "form.tagsTripLimit": "This trip has used all the suggestions it can ask for.",
  "form.tagPlaceholder": "Add a tag…",
  "form.place": "Place",
  "form.photo": "Photo",
  "form.removePhoto": "Remove",
  "form.photoSending": "Sending the photo…",
  "form.photoFailed": "The photo did not go through. Pick it again.",
  "form.photoFull": "This trip holds as many photos as it can.",
  "form.mapsPlaceholder": "Paste a Google Maps link",
  "form.pinned": "This drops a pin on the map",
  "form.unpinned": "Paste a Google Maps link to drop a pin on the map",
  "form.unpinnedFind": "Paste a link or use “Find the place” to drop a pin on the map",
  "form.urlNoPin": "No coordinates in that link. Paste the long link from “Share”",
  "form.urlNoPinFind":
    "No coordinates in that link. Paste the long link from “Share”, or use “Find the place”",
  "form.findPlace": "Find the place",
  "form.placeNaming": "Looking up what is here…",
  "form.placesAsking": "Looking for the place…",
  "form.placesNone": "Could not tell a place on the map from this note.",
  "form.placesFailed": "The places did not come back. Ask again.",
  "form.placesCredit": "Map data © OpenStreetMap contributors",
  "form.hours": "Hours (OpenStreetMap):",
  "form.color": "Color",
  "form.save": "Save",
  "form.saveToCanvas": "Save to canvas",
  "form.hint": "It pops up in the middle of where you were looking on the canvas",
  "form.hintDocked": "Each note you save goes on the canvas",
  "form.saveHere": "Pin it here",
  "form.hintHere": "It becomes a pin at this place on the map, and a note on the canvas too",
  "form.saveNoPlace": "Save",
  "form.hintNoPlace":
    "It goes on the canvas. Paste a Google Maps link above and it becomes a pin too",

  "map.all": "All",
  "map.route": "Route {$date}",
  "map.noPin": `
.input {$count :integer}
.match $count
one {{{$count} note has no place}}
*   {{{$count} notes have no place}}
`,
  "map.noPinFind": `
.input {$count :integer}
.match $count
one {{{$count} note has no place · open it and use “Find the place”}}
*   {{{$count} notes have no place · open one and use “Find the place”}}
`,
  "map.openInGoogleMaps": "Open in Google Maps",

  "shiori.summary": "{$fixed :integer} confirmed · {$total}",
  "shiori.summaryCount": "{$fixed :integer} confirmed",
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
  "shiori.dayTab": "Day {$n :integer} · {$date}",
  "shiori.appendix": "Appendix",
  "shiori.dayHeading": "Day {$n :integer} {#date}{$date}{/date}",
  "shiori.intro": "A line about this day",
  "shiori.introPlaceholder": "A line about this day (shown at the top of the booklet)",
  "shiori.dayEmpty": "Nothing yet. Add some from “Notes without a day” above.",
  "shiori.time": "Time",
  "shiori.removeDay": "Remove day",
  "shiori.anytime": "Anytime",
  "shiori.mapLink": "Map",
  "shiori.walk": "About {$minutes :integer} min on foot",
  "shiori.far": "About {$km} km as the crow flies",
  "shiori.fromStay": "From the stay",
  "shiori.toStay": "Back to the stay",
  "shiori.ifTime": "If there is time",
  "shiori.draft": "draft",
  "shiori.adoptDraft": "Set times and confirm",
  "shiori.askDraft": "Draft the order and times",
  "shiori.drafting": "Drafting…",
  "shiori.draftFailed": "The draft did not come back. Ask again.",
  "shiori.draftLimit": "That is all the drafts for today. Ask again tomorrow.",
  "shiori.draftTripLimit": "This trip has used all the drafts it can ask for.",
  "shiori.dayTotal": "Budget for the day {$total}",
  "shiori.tagEmpty": "No notes with this tag yet",
  "shiori.export": "Export",
  "shiori.exporting": "Exporting…",
  "shiori.exportFailed": "Could not export. Try again.",
} satisfies Record<string, string>;
