import type { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { TagSchema, type NoteColor, type NoteStatus, type Tag } from "../../../contract/room";
import type { MemberId } from "../members/types";
import type { HttpUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";

import type { ImageId, NoteId } from "./id";

// a card's papers and a schedule's statuses, as the app takes them from the contract
export {
  COLORS,
  tagOf,
  TagSchema,
  type NoteColor,
  type NoteStatus,
  type Tag,
} from "../../../contract/room";

/** How each paper is called, for a swatch's label (message ids) */
export const COLOR_NAMES = {
  "#fff1b8": "color.yellow",
  "#ffd9de": "color.pink",
  "#d8f0e6": "color.mint",
  "#dbe7ff": "color.sky",
  "#ead9ff": "color.lilac",
  "#ffffff": "color.white",
} as const satisfies Record<NoteColor, string>;

/**
 * How each paper is drawn. The hex is what the room stores and stays as it is; the
 * screen paints the theme's token for it, so the palette can change without a migration.
 */
export const PAPERS = {
  "#fff1b8": "var(--paper-yellow)",
  "#ffd9de": "var(--paper-pink)",
  "#d8f0e6": "var(--paper-mint)",
  "#dbe7ff": "var(--paper-sky)",
  "#ead9ff": "var(--paper-lilac)",
  "#ffffff": "var(--paper-white)",
} as const satisfies Record<NoteColor, string>;

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
  /** How large the card is drawn, 1 being its own size */
  scale: number;
  by: MemberId;
  updatedAt: Temporal.Instant;
}

/** An ordinary note: it can carry tags, a place, a day and a budget */
export interface Memo extends CardBase {
  kind: "memo";
  body: string;
  tags: Tag[];
  mapsUrl: HttpUrl | null;
  pin: LatLng | null;
  schedule: Schedule | null;
  budget: number | null;
  /** Ticked off on a list (the booklet's appendix), shared with the room; separate from a day's status */
  checked: boolean;
  /** A picture on the card, kept by the room; null for none */
  image: ImageId | null;
}

/** A suggestion waits to be adopted (becoming a memo) or dismissed; anyone can make one */
export interface Suggestion extends CardBase {
  kind: "suggestion";
}

/**
 * Words set straight on the desk, with no paper under them: a heading, a label, where a note
 * would be too much. `title` is what it says; it has no paper, so its color is not shown.
 */
export interface TextBox extends CardBase {
  kind: "text";
}

/**
 * A picture cut out and stuck straight on the desk: no paper and no words, only what it shows,
 * edged in white like a sticker. Its title and color are not shown.
 */
export interface Sticker extends CardBase {
  kind: "sticker";
  image: ImageId;
}

export type Note = Memo | Suggestion | TextBox | Sticker;

/** A text box as it is written; who and when are the room's to stamp, as for a memo */
export type NewText = Omit<TextBox, "by" | "updatedAt">;
/** A sticker as it is stuck; who and when are the room's to stamp */
export type NewSticker = Omit<Sticker, "by" | "updatedAt">;

/** A memo that is on a day */
export type Scheduled = Memo & { schedule: Schedule };

/**
 * A memo as its writer makes it. Who wrote it and when is the room's to stamp (the Worker
 * ignores both), so a new memo has neither until the room or the ledger applies it.
 */
export type NewMemo = Omit<Memo, "by" | "updatedAt">;

/** What the form writes */
export type NoteInput = Pick<
  Memo,
  "title" | "body" | "tags" | "color" | "mapsUrl" | "pin" | "image"
>;

/**
 * What the form is open on: a new memo (pinned when written from the map), or an existing one,
 * by id, so the form always edits the memo as it is now
 */
export type FormTarget = { kind: "new"; pin: LatLng | null } | { kind: "edit"; id: NoteId };

/** What can change on a memo after it is written */
export type MemoPatch = Partial<Omit<Memo, "id" | "kind" | "by" | "updatedAt">>;

/** Tags with a meaning of their own: packing notes never need a day or a pin */
export const PACKING_TAG = v.parse(TagSchema, "Packing");
export const ARRIVAL_TAG = v.parse(TagSchema, "On arrival");
