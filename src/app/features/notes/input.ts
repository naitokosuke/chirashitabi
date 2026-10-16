import type { LatLng } from "../place/types";

import {
  COLORS,
  tagOf,
  type Memo,
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
  booking: note.booking,
  due: note.due,
  assignee: note.assignee,
});

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
  booking: null,
  due: null,
  assignee: null,
});

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
export const normalizeTag = (raw: string): Tag | null => tagOf(raw.replace(/^#/, "").trim());

/**
 * The first line is the title, the rest the body. `#tags` anywhere become
 * tags and are dropped from the title (unless nothing else is left).
 */
/** A `#tag` written in the text becomes a tag and leaves the text, title and body alike */
export function parseNoteText(text: string): Pick<NoteInput, "title" | "body" | "tags"> {
  const [first = "", ...rest] = text.trim().split("\n");
  // a word too long for the room is left in the words, not made a tag it would refuse
  const tags = [...text.matchAll(/#([^\s#]+)/g)].flatMap(([, word]) => tagOf(word) ?? []);
  const strip = (line: string) =>
    line
      .replace(/#([^\s#]+)/g, (whole, word: string) => (tagOf(word) === null ? whole : ""))
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
