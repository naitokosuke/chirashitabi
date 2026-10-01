import { COLORS, type Note, type NoteInput } from "./types";

/** The form's starting point when editing an existing note */
export const inputFromNote = (note: Note): NoteInput => ({
  title: note.title,
  body: note.body,
  tags: [...note.tags],
  color: note.color,
  mapsUrl: note.mapsUrl,
  lat: note.lat,
  lng: note.lng,
});

/** A new note: carries the tags being filtered on, and a pin when written from the map */
export const blankInput = (
  tags: Iterable<string>,
  at?: { lat: number; lng: number } | null,
): NoteInput => ({
  title: "",
  body: "",
  tags: [...tags],
  color: COLORS[0],
  lat: at?.lat,
  lng: at?.lng,
});

/** The textarea shows the title on the first line, the body below */
export const noteText = (input: Pick<NoteInput, "title" | "body">) =>
  [input.title, input.body].filter(Boolean).join("\n");

/** "#Food " -> "Food" */
export const normalizeTag = (raw: string) => raw.replace(/^#/, "").trim();

/**
 * The first line is the title, the rest the body. `#tags` anywhere become
 * tags and are dropped from the title (unless nothing else is left).
 */
export function parseNoteText(text: string): Pick<NoteInput, "title" | "body" | "tags"> {
  const [first, ...rest] = text.trim().split("\n");
  const tags = [...text.matchAll(/#([^\s#]+)/g)].map((m) => m[1]);
  const title = first.replace(/#[^\s#]+/g, "").trim() || first;
  return { title, body: rest.join("\n"), tags };
}
