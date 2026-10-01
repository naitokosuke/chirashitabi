import type { Temporal } from "temporal-polyfill-lite";

/** A suggestion waits to be adopted or dismissed; anyone can make one */
export type NoteKind = "note" | "suggestion";
export type NoteStatus = "idea" | "fixed" | "done";

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
  by: string; // a member id
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

/** Tags with a meaning of their own: packing notes never need a day or a pin */
export const PACKING_TAG = "Packing";
export const ARRIVAL_TAG = "On arrival";

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"];
