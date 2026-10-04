# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people planning one trip together: the owner and their partner.
Each trip is a room the two of them share; an AI agent (Claude) is a member of the room on the same footing in the interface, with its own name and color, and its notes and drafts show up beside theirs.

Two situations, with different needs:

- Weeks before the trip, at home in Japan, on a phone or a laptop with good connectivity: throwing ideas in, moving them around, arguing about days.
- On the trip, in Taiwan, on a phone, often one-handed, sometimes with poor or no connectivity: reading the booklet, opening a place in Google Maps.

## Product Purpose

A brainstorming notebook for a trip.
Ideas go in as sticky notes scattered on a canvas, with nothing decided; the same notes become pins on a map and, once given a day, lines in a booklet.
Success is that both people watch the plan take shape without ever filling in a table first, and that the booklet is what they actually read on the trip.

## Positioning

Scatter first, then it becomes an itinerary.
Trip planners start from the schedule; this starts from the pile of ideas and lets structure arrive late, so that an unplaced note is a normal state rather than an error.

## Operating Context

- Sign-in is Cloudflare Access with an e-mail code; there is no account inside the app. A person belongs to rooms; a room holds at most two people and the agent.
- Places arrive as Google Maps links pasted into the note form, or found from the note by Claude and OpenStreetMap (which makes the link); coordinates come from the link, or from a long-press on the map.
- A trip has a name, a run of days, a currency and a map center. A note can carry tags, a body, a place, a day with a time and a status (maybe, confirmed, done), and a budget.
- The interface is in Japanese and English, chosen per device.
- The booklet (`shiori`) is read on the trip, on a phone; it must survive a bad connection.
- Everything runs on Cloudflare's free tier by design; the owner's standing requirement is that nobody outside the two members can cause a paid call, and that a lost phone or a bug can only spend a bounded amount (`docs/auth-and-security.md`).

## Capabilities and Constraints

Working today:

- The canvas (pan, pinch; a card picked with a tap is moved, resized and turned with handles, and recolored, duplicated or deleted from its toolbar; a double tap opens it; undo of the last add), text written straight on the desk with a double click (a text box, moved, resized and turned like a card), the note form, tag filtering.
- The memo tab: the note form kept open as its own view, for writing one note after another; each lands on the canvas.
- The home tab: the trip at a glance (name, dates, members, flights, note and budget counts, notes per day) and the way out to another trip. Its settings are edited there: the name, when the trip is (first day and length; what is planned moves with it, and what falls outside goes back to having no day) and the flights there and home (number, airports, local departure and arrival); the booklet heads a day with the flights that leave or land on it.
- The map (MapLibre + OpenFreeMap, no key): pins, a day's route, long-press to write a note at a place.
- The booklet: days with intros, notes placed on days with times and statuses, an appendix by tag, a per-day budget, a tray of notes still without a day.
- Suggestions: a card anyone (including the agent) can leave, adopted into an ordinary note or dismissed.
- Pictures: a note can carry one photo, shrunk on the phone and kept privately for the room.
- Rooms: create, remember on the device, reconnect; both members see each other's changes live.
- People: the owner (who made the trip) invites the other person by e-mail, takes an invitation back, removes them, and deletes the trip; the invited person joins with their own name and color or declines; anyone but the owner may leave; either person can restore a deleted trip for 30 days. Deleting and leaving are offered on the trip's home and on the list of trips.

The agent (Claude) drafts a day's order, times and intro, and leaves a few ideas as suggestion cards on the canvas, when a member asks, within a daily and per-trip budget.
While writing a note, the tags in use line up in the order they fit its words, as they are typed. Once the words settle, Clef (Workers AI) judges which tags fit its words and photo, from the tags in use and candidates Claude proposed once for the trip, and those move up; it asks by itself at most twice a note, and in a room with no tags yet the first ask is a tap.
And when asked, Claude names the place a note is about and OpenStreetMap finds it, so a note can get its Google Maps link and its pin without leaving the app. A note started at a point on the map gets that point's link at once, and OpenStreetMap's name for what is there as its title when it has none.
Planned, not built: expanding short `maps.app.goo.gl` links, publishing the booklet as a public read-only page.

Terminology: a note is a 付箋/sticky; the booklet is しおり/shiori; the people and the agent are members; a trip's shared space is a room.

Constraints to preserve: two people per room; no Google key ever ships to the browser; the public booklet page costs nothing to view; paid calls are budgeted per person.

## Brand Commitments

- The name `chirashitabi` (散らし + 旅: scatter, and a trip), set in lowercase as a wordmark; no logo asset exists.
- The sticky-note and notebook metaphor: ideas are paper notes scattered on a surface, and the result is a booklet (`shiori`). Future design keeps this metaphor; it may change how it is drawn.
- No web font: the app uses each device's own Japanese gothic (owner's decision, 2026-10-02, for load time and offline reading on the trip).

## Evidence on Hand

- A mock Taiwan trip (`src/app/mocks/`): four days, three members, a dozen notes. It is placeholder content for development, not real user data.
- The production room the owner made on 2026-10-02 holds the first real notes.
- No testimonials, screenshots for marketing, logos or illustrations exist; future work must not invent any.

## Product Principles

- **Scatter before structure.** Any note may stay unplaced forever; the interface never nags about it.
- **One notebook, two hands.** Everything is visible to both members as it happens; there is no "mine" and "yours", only "by whom".
- **The agent is a member, not a feature.** Its contributions appear as cards and drafts in the same vocabulary as a person's, and can be dismissed the same way.
- **Nothing costs money by accident.** A design decision that adds a paid call or a key in the browser is a product decision, not a dashboard click.
- **The booklet travels.** What matters on the trip is readable on a phone, one-handed, with the connection gone.
