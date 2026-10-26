import { Temporal } from "temporal-polyfill-lite";

import { MAX_BODY, MAX_TAGS, MAX_TITLE } from "../../../contract/room";
import { parseHttpUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";

import {
  COLORS,
  parseTag,
  type Booking,
  type Memo,
  type MemoPatch,
  type Note,
  type NoteInput,
  type Suggestion,
  type Tag,
} from "./types";

/** The form's starting point when editing an existing memo */
export const inputFromNote = (note: Memo): NoteInput => ({
  title: note.title,
  body: note.body,
  tags: [...note.tags],
  color: note.color,
  mapsUrl: note.mapsUrl,
  pin: note.pin,
  image: note.image,
  minutes: note.minutes,
  hours: note.hours,
  link: note.link,
  booking: note.booking,
  due: note.due,
  assignee: note.assignee,
});

/**
 * What an edit changed from what the form opened on: only those fields, so what someone else
 * changed meanwhile in the others stays. Both are the form's own, built the same way, so a field
 * is the same when it writes out the same.
 */
export function changes(from: NoteInput, to: NoteInput): MemoPatch {
  const moved = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  return {
    ...(moved(from.title, to.title) && { title: to.title }),
    ...(moved(from.body, to.body) && { body: to.body }),
    ...(moved(from.tags, to.tags) && { tags: to.tags }),
    ...(moved(from.color, to.color) && { color: to.color }),
    ...(moved(from.mapsUrl, to.mapsUrl) && { mapsUrl: to.mapsUrl }),
    ...(moved(from.pin, to.pin) && { pin: to.pin }),
    ...(moved(from.image, to.image) && { image: to.image }),
    ...(moved(from.minutes, to.minutes) && { minutes: to.minutes }),
    ...(moved(from.hours, to.hours) && { hours: to.hours }),
    ...(moved(from.link, to.link) && { link: to.link }),
    ...(moved(from.booking, to.booking) && { booking: to.booking }),
    ...(moved(from.due, to.due) && { due: to.due }),
    ...(moved(from.assignee, to.assignee) && { assignee: to.assignee }),
  };
}

/** A new memo: carries the tags being filtered on, and a pin when written from the map */
export const blankInput = (tags: Iterable<Tag>, pin: LatLng | null): NoteInput => ({
  title: "",
  body: "",
  tags: [...tags],
  color: COLORS[0],
  mapsUrl: null,
  pin,
  image: null,
  minutes: null,
  hours: null,
  link: null,
  booking: null,
  due: null,
  assignee: null,
});

/**
 * A booking as the form holds it while it is written: none, or what its choice asks for, as
 * typed. Only the fields of the choice made are there, so a number with no booking cannot be.
 */
export type BookingDraft =
  | { state: "none" }
  | { state: "needed"; by: string }
  | { state: "booked"; code: string; url: string };

/** The fields as a booking fills them */
export function bookingDraft(b: Booking | null): BookingDraft {
  if (b === null) return { state: "none" };
  if (b.state === "needed") return { state: "needed", by: b.by?.toString() ?? "" };
  return { state: "booked", code: b.code, url: b.url ?? "" };
}

/** A choice from the list, what it asks for still blank; what is no choice is no booking */
export function chosenBooking(state: string): BookingDraft {
  if (state === "needed") return { state: "needed", by: "" };
  if (state === "booked") return { state: "booked", code: "", url: "" };
  return { state: "none" };
}

/** The booking as the fields say it; a page that is no http(s) link is none */
export function bookingOf(d: BookingDraft): Booking | null {
  if (d.state === "none") return null;
  if (d.state === "needed")
    return { state: "needed", by: d.by === "" ? null : Temporal.PlainDate.from(d.by) };
  return { state: "booked", code: d.code.trim(), url: parseHttpUrl(d.url.trim()) };
}

/** A copy keeps the words and the look, not the place */
export const duplicateInput = (n: Note): NoteInput => ({
  title: n.title,
  body: n.kind === "memo" ? n.body : "",
  tags: n.kind === "memo" ? [...n.tags] : [],
  color: n.color,
  mapsUrl: null,
  pin: null,
  // the picture stays the room's; the copy shows the same one
  image: n.kind === "memo" ? n.image : null,
  // and how long it takes, which goes with the words
  minutes: n.kind === "memo" ? n.minutes : null,
  // the hours are the place's, which the copy does not keep, and a booking is the one plan's
  hours: null,
  // where the idea came from goes with the words
  link: n.kind === "memo" ? n.link : null,
  booking: null,
  // a copied to-do is another one, to be given its own day and someone
  due: null,
  assignee: null,
});

/** What a suggestion becomes once adopted: a plain white memo, nothing planned yet */
export const adopted = (s: Suggestion): Memo => ({
  ...s,
  kind: "memo",
  color: "#ffffff",
  body: "",
  tags: [],
  mapsUrl: null,
  pin: null,
  schedule: null,
  budget: null,
  checked: false,
  image: null,
  minutes: null,
  hours: null,
  link: null,
  booking: null,
  due: null,
  assignee: null,
});

/** Tags shown on a card; suggestions have none */
export const tagsOf = (n: Note): readonly Tag[] => (n.kind === "memo" ? n.tags : []);

/** The textarea shows the title on the first line, the body below */
export const noteText = (input: Pick<NoteInput, "title" | "body">) =>
  [input.title, input.body].filter(Boolean).join("\n");

/** "#Food " -> "Food"; null for what is no tag (blank, or longer than the room keeps) */
export const normalizeTag = (raw: string): Tag | null => parseTag(raw.replace(/^#/, "").trim());

/**
 * The first line is the title, the rest the body. `#tags` anywhere become
 * tags and are dropped from the title (unless nothing else is left).
 */
/** A `#tag` written in the text becomes a tag and leaves the text, title and body alike */
export function parseNoteText(text: string): Pick<NoteInput, "title" | "body" | "tags"> {
  const [first = "", ...rest] = text.trim().split("\n");
  // a word too long for the room is left in the words, not made a tag it would refuse
  const tags = [...text.matchAll(/#([^\s#]+)/g)].flatMap(([, word]) => parseTag(word) ?? []);
  const strip = (line: string) =>
    line
      .replace(/#([^\s#]+)/g, (whole, word: string) => (parseTag(word) === null ? whole : ""))
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  const stripped = strip(first);
  const title = stripped === "" ? first : stripped;
  const body = rest
    .map(strip)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, body, tags };
}

/**
 * Which of a memo's words the room would refuse: a title (its first line) longer than a title
 * may be, a body longer than a body may be, or more tags than a memo holds; null while all fit
 */
export function tooMuchOf({
  title,
  body,
  tags,
}: Pick<NoteInput, "title" | "body" | "tags">): "title" | "body" | "tags" | null {
  if (title.length > MAX_TITLE) return "title";
  if (body.length > MAX_BODY) return "body";
  if (tags.length > MAX_TAGS) return "tags";
  return null;
}
