import type { LatLng } from "../place/types";

import { COLORS, type Memo, type Note, type NoteInput, type Suggestion } from "./types";

/** The form's starting point when editing an existing memo */
export const inputFromNote = (note: Memo): NoteInput => ({
  title: note.title,
  body: note.body,
  tags: [...note.tags],
  color: note.color,
  mapsUrl: note.mapsUrl,
  pin: note.pin,
});

/** A new memo: carries the tags being filtered on, and a pin when written from the map */
export const blankInput = (tags: Iterable<string>, pin: LatLng | null): NoteInput => ({
  title: "",
  body: "",
  tags: [...tags],
  color: COLORS[0],
  mapsUrl: null,
  pin,
});

/** A copy keeps the words and the look, not the place */
export const duplicateInput = (n: Note): NoteInput => ({
  title: n.title,
  body: n.kind === "memo" ? n.body : "",
  tags: n.kind === "memo" ? [...n.tags] : [],
  color: n.color,
  mapsUrl: null,
  pin: null,
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
});

/** Tags shown on a card; suggestions have none */
export const tagsOf = (n: Note): readonly string[] => (n.kind === "memo" ? n.tags : []);

/** The textarea shows the title on the first line, the body below */
export const noteText = (input: Pick<NoteInput, "title" | "body">) =>
  [input.title, input.body].filter(Boolean).join("\n");

/** "#Food " -> "Food" */
export const normalizeTag = (raw: string) => raw.replace(/^#/, "").trim();

/**
 * The first line is the title, the rest the body. `#tags` anywhere become
 * tags and are dropped from the title (unless nothing else is left).
 */
/** A `#tag` written in the text becomes a tag and leaves the text, title and body alike */
export function parseNoteText(text: string): Pick<NoteInput, "title" | "body" | "tags"> {
  const [first, ...rest] = text.trim().split("\n");
  const tags = [...text.matchAll(/#([^\s#]+)/g)].map((m) => m[1]);
  const strip = (line: string) =>
    line
      .replace(/#[^\s#]+/g, "")
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
