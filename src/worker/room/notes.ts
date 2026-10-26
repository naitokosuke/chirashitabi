import * as v from "valibot";

import type { ImageId } from "../../contract/image";
import type { MemberId } from "../../contract/member";
import type { NoteId } from "../../contract/note";
import type { HttpUrl } from "../../contract/place";
import { parseTag, type NoteColor, type NoteStatus, type Tag } from "../../contract/room";
import {
  WireMemoSchema,
  WireNoteSchema,
  type IsoDate,
  type IsoInstant,
  type IsoTime,
  type WireBooking,
  type WireMemo,
  type WireNote,
} from "../../contract/wire";

/** A note as the notes table keeps it: every kind in a memo's columns */
export type NoteRow = {
  id: NoteId;
  kind: WireNote["kind"];
  /** Paper's title, a text box's words, blank for a sticker; `color` is white for all but paper (faceColumns) */
  title: string;
  color: NoteColor;
  x: number;
  y: number;
  rot: number;
  scale: number;
  by: MemberId;
  updated_at: IsoInstant;
  body: string;
  tags: string;
  maps_url: HttpUrl | null;
  pin_lat: number | null;
  pin_lng: number | null;
  sched_date: IsoDate | null;
  sched_time: IsoTime | null;
  sched_status: NoteStatus | null;
  budget: number | null;
  checked: number;
  image: ImageId | null;
  minutes: number | null;
  hours: string | null;
  link: HttpUrl | null;
  booking_state: WireBooking["state"] | null;
  booking_by: IsoDate | null;
  booking_code: string | null;
  booking_url: HttpUrl | null;
  due: IsoDate | null;
  assignee: MemberId | null;
};

/**
 * The notes on the desk, to select from as from a table: a deleted note keeps its row (its id is
 * never used again) and is no note anywhere else, so no query reads `notes` for what is on it
 */
export const ON_DESK = "(SELECT rowid, * FROM notes WHERE deleted_at IS NULL)";

/**
 * The notes on the desk as the wire carries them, in the order they were made, each read with
 * the contract's check. One that does not read (a row from before a check, which `migrate`
 * has not repaired yet) is left out and logged: one note never keeps the room from opening.
 */
export const readNotes = (sql: SqlStorage): WireNote[] =>
  sql
    .exec<NoteRow>(`SELECT * FROM ${ON_DESK} ORDER BY rowid`)
    .toArray()
    .flatMap((r) => {
      const read = v.safeParse(WireNoteSchema, fromRow(r));
      if (read.success) return [read.output];
      console.warn("room: a note that does not read is left out", { id: r.id, kind: r.kind });
      return [];
    });

/**
 * What a memo's field is cleared to when the contract refuses what its row keeps, as the
 * columns that keep it; a field not here (which note, its kind, who wrote it and when, a text
 * box's words, a sticker's picture) has nothing to fall back to, and its note goes
 */
const CLEARED: Partial<Record<string, Partial<NoteRow>>> = {
  x: { x: 0 },
  y: { y: 0 },
  rot: { rot: 0 },
  scale: { scale: 1 },
  title: { title: "" },
  color: { color: "#ffffff" },
  body: { body: "" },
  tags: { tags: "[]" },
  mapsUrl: { maps_url: null },
  pin: { pin_lat: null, pin_lng: null },
  schedule: { sched_date: null, sched_time: null, sched_status: null },
  budget: { budget: null },
  checked: { checked: 0 },
  image: { image: null },
  minutes: { minutes: null },
  hours: { hours: null },
  booking: { booking_state: null, booking_by: null, booking_code: null, booking_url: null },
  due: { due: null },
  assignee: { assignee: null },
  link: { link: null },
};

/**
 * What to do with a note's row for the contract to read it: nothing; clear the fields it
 * refuses, as these columns (each field checked as a memo's, which every kind's are but its
 * kind and a text box's words); or delete it, when that is not enough or would make it another
 * kind (a sticker without its picture)
 */
export function repairOf(
  r: NoteRow,
): { kind: "fine" } | { kind: "clear"; columns: Partial<NoteRow> } | { kind: "delete" } {
  const note = fromRow(r);
  if (v.safeParse(WireNoteSchema, note).success) return { kind: "fine" };
  const fields: Record<string, unknown> = { ...note };
  const refused = Object.entries(WireMemoSchema.entries).flatMap(([key, schema]) =>
    key !== "kind" && key in fields && !v.is(schema, fields[key]) ? [key] : [],
  );
  if (refused.some((key) => CLEARED[key] === undefined)) return { kind: "delete" };
  const columns = refused.reduce<Partial<NoteRow>>((c, key) => ({ ...c, ...CLEARED[key] }), {});
  const cleared = fromRow({ ...r, ...columns });
  return cleared.kind === note.kind && v.safeParse(WireNoteSchema, cleared).success
    ? { kind: "clear", columns }
    : { kind: "delete" };
}

/** The row of the note `id` on the desk; undefined when it is not on it */
export const readNote = (sql: SqlStorage, id: NoteId): NoteRow | undefined =>
  sql.exec<NoteRow>(`SELECT * FROM ${ON_DESK} WHERE id = ?`, id).toArray()[0];

/**
 * What a note shows of itself as the title and color columns keep it: paper its title and
 * color; a text box its words, as its title, on white; a sticker no words, on white
 */
export const faceColumns = (n: WireNote): [NoteRow["title"], NoteRow["color"]] => {
  switch (n.kind) {
    case "memo":
    case "suggestion":
      return [n.title, n.color];
    case "text":
      return [n.text, "#ffffff"];
    case "sticker":
      return ["", "#ffffff"];
  }
};

/** A booking as its columns keep it: the state, then what that state has */
export const bookingColumns = (
  b: WireBooking | null,
): [
  NoteRow["booking_state"],
  NoteRow["booking_by"],
  NoteRow["booking_code"],
  NoteRow["booking_url"],
] =>
  b === null
    ? [null, null, null, null]
    : b.state === "needed"
      ? ["needed", b.by, null, null]
      : ["booked", null, b.code, b.url];

/** A note's tags as its column keeps them: a JSON array of strings; none, when it is not one */
const tagsOf = (column: string): Tag[] => {
  let tags: unknown;
  try {
    tags = JSON.parse(column);
  } catch {
    return [];
  }
  return Array.isArray(tags) ? tags.flatMap((t: unknown) => parseTag(t) ?? []) : [];
};

const fromRow = (r: NoteRow): WireNote => {
  const card = {
    id: r.id,
    x: r.x,
    y: r.y,
    rot: r.rot,
    scale: r.scale,
    by: r.by,
    updatedAt: r.updated_at,
  };
  const memo = (): WireMemo => ({
    ...card,
    title: r.title,
    color: r.color,
    kind: "memo",
    body: r.body,
    tags: tagsOf(r.tags),
    mapsUrl: r.maps_url,
    pin: r.pin_lat === null || r.pin_lng === null ? null : { lat: r.pin_lat, lng: r.pin_lng },
    schedule:
      r.sched_date === null || r.sched_status === null
        ? null
        : { date: r.sched_date, time: r.sched_time, status: r.sched_status },
    budget: r.budget,
    checked: r.checked === 1,
    image: r.image ?? null,
    minutes: r.minutes,
    hours: r.hours,
    booking: bookingOf(r),
    due: r.due,
    assignee: r.assignee,
    link: r.link,
  });
  switch (r.kind) {
    case "memo":
      return memo();
    case "suggestion":
      return { ...card, title: r.title, color: r.color, kind: "suggestion" };
    case "text":
      return { ...card, kind: "text", text: r.title };
    case "sticker":
      // a sticker is never written without its picture; one that had none would be shown as the
      // memo it is kept as rather than not at all
      return r.image === null ? memo() : { ...card, kind: "sticker", image: r.image };
  }
};

const bookingOf = (r: NoteRow): WireBooking | null => {
  if (r.booking_state === "needed") return { state: "needed", by: r.booking_by };
  if (r.booking_state === "booked")
    return { state: "booked", code: r.booking_code ?? "", url: r.booking_url };
  return null;
};
