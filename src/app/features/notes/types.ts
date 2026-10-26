import type { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { TagSchema, type NoteColor, type NoteStatus, type Tag } from "../../../contract/room";
import type { WireMemoPatch } from "../../../contract/wire";
import type { MemberId } from "../members/types";
import type { HttpUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";

import type { ImageId, NoteId } from "./id";

// a card's papers and a schedule's statuses, as the app takes them from the contract
export {
  COLORS,
  parseTag,
  TagSchema,
  type NoteColor,
  type NoteStatus,
  type Tag,
} from "../../../contract/room";

/** Where a note sits on a day. Off the itinerary there is no time or status to speak of */
export interface Schedule {
  date: Temporal.PlainDate;
  time: Temporal.PlainTime | null; // null: "Anytime"
  status: NoteStatus;
}

/** How a card is turned (degrees) and how large it is drawn */
export interface Shape {
  rot: number;
  scale: number;
}

/** What every card on the canvas has, whatever its kind: which it is, where, and whose */
interface CardBase {
  id: NoteId;
  x: number;
  y: number;
  rot: number;
  /** How large the card is drawn, 1 being its own size */
  scale: number;
  by: MemberId;
  updatedAt: Temporal.Instant;
}

/** A card on paper: it has a title, and the paper a color */
interface PaperBase extends CardBase {
  title: string;
  color: NoteColor;
}

/** An ordinary note: it can carry tags, a place, a day and a budget */
export interface Memo extends PaperBase {
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
  /** How long it takes there, in minutes; null for not said. With a time, the booklet says when it ends */
  minutes: number | null;
  /** When its place is open, as OpenStreetMap writes it (place/hours.ts reads it); null for not said */
  hours: string | null;
  /** The page its idea came from (a blog, a video); its title and picture may have come from it too */
  link: HttpUrl | null;
  /** Whether it has to be booked, and how far that has got; null for no booking */
  booking: Booking | null;
  /** The day a to-do is to be done by; null for none */
  due: Temporal.PlainDate | null;
  /** Who is to do it or book it; null for whoever */
  assignee: MemberId | null;
}

/**
 * A memo's booking: still to book (by a day, or whenever), or booked, with the confirmation's
 * number (blank when not written down) and its page when there is one
 */
export type Booking =
  | { state: "needed"; by: Temporal.PlainDate | null }
  | { state: "booked"; code: string; url: HttpUrl | null };

/** A suggestion waits to be adopted (becoming a memo) or dismissed; anyone can make one */
export interface Suggestion extends PaperBase {
  kind: "suggestion";
}

/**
 * Words set straight on the desk, with no paper under them: a heading, a label, where a note
 * would be too much. `text` is what it says.
 */
export interface TextBox extends CardBase {
  kind: "text";
  text: string;
}

/**
 * A picture cut out and stuck straight on the desk: no paper and no words, only what it shows,
 * edged in white like a sticker
 */
export interface Sticker extends CardBase {
  kind: "sticker";
  image: ImageId;
}

export type Note = Memo | Suggestion | TextBox | Sticker;
/** A card on paper, which has a title and a color: a memo or a suggestion */
export type Paper = Memo | Suggestion;

/**
 * A note as its writer makes it. Who wrote it and when is the room's to stamp (the Worker
 * ignores both), so a new note has neither until the room or the ledger applies it. Over a
 * union it is each kind's own: `Omit` alone would keep only the fields every kind has.
 */
type Unstamped<N extends Note> = N extends Note ? Omit<N, "by" | "updatedAt"> : never;

/** Any note as it is made, as `note:add` carries it */
export type NewNote = Unstamped<Note>;
export type NewMemo = Unstamped<Memo>;
/** A text box as it is written */
export type NewText = Unstamped<TextBox>;
/** A sticker as it is stuck */
export type NewSticker = Unstamped<Sticker>;

/** A memo that is on a day */
export type Scheduled = Memo & { schedule: Schedule };

/** What the form writes */
export type NoteInput = Pick<
  Memo,
  | "title"
  | "body"
  | "tags"
  | "color"
  | "mapsUrl"
  | "pin"
  | "image"
  | "minutes"
  | "hours"
  | "link"
  | "booking"
  | "due"
  | "assignee"
>;

/**
 * What the form is open on: a new memo (pinned when written from the map), or an existing one,
 * by id, so the form always edits the memo as it is now
 */
export type FormTarget = { kind: "new"; pin: LatLng | null } | { kind: "edit"; id: NoteId };

/** What can change on a memo after it is written: what the room takes in a `note:update` */
export type MemoPatch = Partial<Pick<Memo, keyof WireMemoPatch>>;

/** Tags with a meaning of their own: packing notes never need a day or a pin */
export const PACKING_TAG = v.parse(TagSchema, "Packing");
export const ARRIVAL_TAG = v.parse(TagSchema, "On arrival");
/** A to-do before the trip: it never needs a day, and it is ticked off on the trip's home */
export const TODO_TAG = v.parse(TagSchema, "To do");
