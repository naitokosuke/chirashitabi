import type { Temporal } from "temporal-polyfill-lite";

export type NoteKind = "note" | "claude";
export type NoteStatus = "idea" | "fixed" | "done";

export const MEMBERS = {
  yuki: "#3c6ee0",
  ken: "#d7263d",
  claude: "#D97757",
} as const satisfies Record<string, string>;
export type Member = keyof typeof MEMBERS;

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  tags: string[];
  color: string;
  x: number;
  y: number;
  rot: number;
  by: Member;
  // optional, added later for the itinerary
  date?: Temporal.PlainDate;
  time?: Temporal.PlainTime;
  budget?: number | null;
  mapsUrl?: string;
  status?: NoteStatus;
  lat?: number;
  lng?: number;
  updatedAt: Temporal.Instant;
}

export type NoteInput = Pick<Note, "title" | "body" | "tags" | "color"> &
  Partial<Pick<Note, "lat" | "lng" | "mapsUrl">>;

export interface Day {
  date: Temporal.PlainDate;
  intro: string; // 2-3 lines written for the booklet, not a note
}

/** "12:30" — for labels and `<input type="time">` values */
export const hhmm = (t: Temporal.PlainTime) => t.toString({ smallestUnit: "minute" });

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"];
export const TAG_COLORS = [
  "#b11f33",
  "#a06f00",
  "#1f6b53",
  "#2b5bc4",
  "#7a3fb0",
  "#b85c1a",
  "#0f7a8a",
];
