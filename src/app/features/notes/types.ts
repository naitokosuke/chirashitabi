import type { Temporal } from "temporal-polyfill-lite";

import type { Brand } from "../../shared/brand";

import type { MemberId } from "../members/types";
import type { LatLng } from "../place/types";

export type NoteId = Brand<string, "NoteId">;

export const COLORS = ["#fff1b8", "#ffd9de", "#d8f0e6", "#dbe7ff", "#ead9ff", "#ffffff"] as const;
/** A card's paper: one of the palette, never a free CSS value */
export type NoteColor = (typeof COLORS)[number];

/** How each paper is called, for a swatch's label (message ids) */
export const COLOR_NAMES = {
  "#fff1b8": "color.yellow",
  "#ffd9de": "color.pink",
  "#d8f0e6": "color.mint",
  "#dbe7ff": "color.sky",
  "#ead9ff": "color.lilac",
  "#ffffff": "color.white",
} as const satisfies Record<NoteColor, string>;

export type NoteStatus = "idea" | "fixed" | "done";

/** Where a note sits on a day. Off the itinerary there is no time or status to speak of */
export interface Schedule {
  date: Temporal.PlainDate;
  time: Temporal.PlainTime | null; // null: "Anytime"
  status: NoteStatus;
}

/** What every card on the canvas has */
interface CardBase {
  id: NoteId;
  title: string;
  color: NoteColor;
  x: number;
  y: number;
  rot: number;
  by: MemberId;
  updatedAt: Temporal.Instant;
}

/** An ordinary note: it can carry tags, a place, a day and a budget */
export interface Memo extends CardBase {
  kind: "memo";
  body: string;
  tags: string[];
  mapsUrl: string | null;
  pin: LatLng | null;
  schedule: Schedule | null;
  budget: number | null;
}

/** A suggestion waits to be adopted (becoming a memo) or dismissed; anyone can make one */
export interface Suggestion extends CardBase {
  kind: "suggestion";
}

export type Note = Memo | Suggestion;

/** A memo that is on a day */
export type Scheduled = Memo & { schedule: Schedule };

/** What the form writes */
export type NoteInput = Pick<Memo, "title" | "body" | "tags" | "color" | "mapsUrl" | "pin">;

/** What can change on a memo after it is written */
export type MemoPatch = Partial<Omit<Memo, "id" | "kind" | "by" | "updatedAt">>;

/** Tags with a meaning of their own: packing notes never need a day or a pin */
export const PACKING_TAG = "Packing";
export const ARRIVAL_TAG = "On arrival";
