/**
 * What crosses the socket, and the checks it must pass. Temporal values travel
 * as the ISO strings `JSON.stringify` makes of them; the app revives them. Ids and codes
 * travel as the brands they are checked into here, so the app takes them as they come.
 * Nothing from the client is trusted: every field is checked here before a room acts.
 *
 * Every type here is what its schema puts out, so a type cannot say more than its check.
 */
import * as v from "valibot";

import { AirportCodeSchema, type AirportCode } from "./airports";
import { HexColorSchema } from "./color";
import { ImageIdSchema, MemberIdSchema, NoteIdSchema } from "./ids";
import { CurrencyCodeSchema } from "./money";
import { HttpUrlSchema, LatLngSchema } from "./place";
import { COLORS, STATUSES, TagSchema } from "./room";

export const MAX_MESSAGE_BYTES = 32 * 1024;

// ---- limits ----
const TITLE = 200;
/** A text box's words: a few lines at most */
const TEXT = 1000;
const BODY = 4000;
const TAGS = 20;
const INTRO = 1000;
const NAME = 60;
const COORD = 1e6;
const DAYS = 60;
const FLIGHT_NO = 20;
/** Stays in a trip: one a night at most, for a trip as long as it may be */
const STAYS = DAYS;

/** How small and how large a card may be drawn, its own size being 1 */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;

/** What a picture may be, as uploaded: the formats every browser shows */
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
/** The largest picture, in bytes; the app shrinks one to well under this before sending it */
export const MAX_IMAGE_BYTES = 1024 * 1024;

// ---- pieces ----
const text = (max: number) => v.pipe(v.string(), v.maxLength(max));
/** A name as written, at most NAME long, trimmed and not blank */
const named = () => v.pipe(v.string(), v.maxLength(NAME), v.trim(), v.nonEmpty());
const finite = (max = COORD) => v.pipe(v.number(), v.finite(), v.minValue(-max), v.maxValue(max));
const count = (max: number) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(max));
const scale = () => v.pipe(v.number(), v.finite(), v.minValue(MIN_SCALE), v.maxValue(MAX_SCALE));

/** A day the calendar has, as YYYY-MM-DD */
const isDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};
/** A time of day as HH:MM or HH:MM:SS */
const isTimeOfDay = (s: string) => {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  return m !== null && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3] ?? 0) < 60;
};

/** A day as it travels: YYYY-MM-DD, a day the calendar has */
export const IsoDateSchema = v.pipe(v.string(), v.check(isDay), v.brand("IsoDate"));
export type IsoDate = v.InferOutput<typeof IsoDateSchema>;

/** A time of day as it travels: HH:MM or HH:MM:SS */
export const IsoTimeSchema = v.pipe(v.string(), v.check(isTimeOfDay), v.brand("IsoTime"));
export type IsoTime = v.InferOutput<typeof IsoTimeSchema>;

/** A local date and time as it travels: YYYY-MM-DDTHH:MM, seconds optional (as Temporal writes one) */
export const IsoDateTimeSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  v.check((s) => isDay(s.slice(0, 10)) && isTimeOfDay(s.slice(11))),
  v.brand("IsoDateTime"),
);
export type IsoDateTime = v.InferOutput<typeof IsoDateTimeSchema>;

/** A moment as the room stamps it: an ISO instant in UTC, ending in Z */
export const IsoInstantSchema = v.pipe(
  v.string(),
  v.isoTimestamp(),
  v.endsWith("Z"),
  v.brand("IsoInstant"),
);
export type IsoInstant = v.InferOutput<typeof IsoInstantSchema>;

/** The client's id for one of its mutations, which the room's answer names */
export const CidSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/), v.brand("Cid"));
export type Cid = v.InferOutput<typeof CidSchema>;

const ColorSchema = v.picklist(COLORS);

/** The profile a person sets for themselves; the name may be blank, people are told apart by color for now */
export const ProfileSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(NAME), v.trim()),
  color: v.pipe(v.string(), v.toLowerCase(), HexColorSchema),
});

// ---- members and rooms ----

/** A person says whether they made the room; an agent has no say in who is in it */
export const WireMemberSchema = v.variant("kind", [
  v.object({
    id: MemberIdSchema,
    kind: v.literal("person"),
    role: v.picklist(["owner", "guest"]),
    name: v.string(),
    color: HexColorSchema,
  }),
  v.object({
    id: MemberIdSchema,
    kind: v.literal("agent"),
    name: v.string(),
    color: HexColorSchema,
  }),
]);
export type WireMember = v.InferOutput<typeof WireMemberSchema>;

const summary = {
  name: v.string(),
  /** The people first, then the agent, as they look: no ids, no roles; who is who stays in the room */
  members: v.array(
    v.object({ kind: v.picklist(["person", "agent"]), name: v.string(), color: HexColorSchema }),
  ),
  memos: v.number(),
  /** Whether the person asking made the trip, and so may delete it (false on an invitation) */
  owner: v.boolean(),
};

/** A room as `/api/me` lists it: the trip at a glance, without its notes; its first day, none while it has no days */
export const WireRoomSummarySchema = v.union([
  v.object({ ...summary, first: v.null(), days: v.literal(0) }),
  v.object({ ...summary, first: IsoDateSchema, days: v.number() }),
]);
export type WireRoomSummary = v.InferOutput<typeof WireRoomSummarySchema>;

// ---- the trip ----

/** A flight's time kept to the minute, as a ticket says it */
const toMinute = v.pipe(
  IsoDateTimeSchema,
  v.transform((t) => t.slice(0, 16)),
  v.brand("IsoDateTime"),
);

/** Which flight: the one there, or the one home */
const LegSchema = v.picklist(["out", "back"]);
export type Leg = v.InferOutput<typeof LegSchema>;

/**
 * A flight as the travellers write it from their ticket: where it leaves from and lands (each an
 * airport's code on the list, airports.ts), and, when they know them, its number and when, in
 * each airport's own local time (YYYY-MM-DDTHH:MM; null for not known yet). The landing may read
 * earlier than the leaving, across time zones, so their order is not checked.
 */
const WireFlightSchema = v.object({
  /** May be blank; trimmed */
  number: v.pipe(v.string(), v.maxLength(FLIGHT_NO), v.trim()),
  from: AirportCodeSchema,
  to: AirportCodeSchema,
  departs: v.nullable(toMinute),
  arrives: v.nullable(toMinute),
});
export type WireFlight = v.InferOutput<typeof WireFlightSchema>;

const WireFlightsSchema = v.object({
  out: v.nullable(WireFlightSchema),
  back: v.nullable(WireFlightSchema),
});
export type WireFlights = v.InferOutput<typeof WireFlightsSchema>;

/**
 * Where the travellers sleep: a name, the first night (YYYY-MM-DD) and how many, and where it
 * is, as a Google Maps link and the point it names, when they gave one
 */
const WireStaySchema = v.pipe(
  v.object({
    name: named(),
    checkIn: IsoDateSchema,
    nights: count(DAYS),
    mapsUrl: v.nullable(HttpUrlSchema),
    pin: v.nullable(LatLngSchema),
  }),
  // no link, no point: a pin is only ever the point a link names
  v.transform(({ mapsUrl, pin, ...stay }) =>
    mapsUrl === null ? { ...stay, mapsUrl, pin: null } : { ...stay, mapsUrl, pin },
  ),
);
export type WireStay = v.InferOutput<typeof WireStaySchema>;

const WireDaySchema = v.object({ date: IsoDateSchema, intro: v.string() });
export type WireDay = v.InferOutput<typeof WireDaySchema>;

export const WireTripSchema = v.object({
  name: v.string(),
  days: v.array(WireDaySchema),
  currency: CurrencyCodeSchema,
  center: LatLngSchema,
  /** The flight there and the flight home, each or both not known yet */
  flights: WireFlightsSchema,
  /** Where the nights are spent, in the order they come */
  stays: v.array(WireStaySchema),
});
export type WireTrip = v.InferOutput<typeof WireTripSchema>;

/** What a room is created with: its name, its days (each once), its money and where it is */
export const NewTripSchema = v.pipe(
  v.object({
    name: named(),
    days: v.pipe(
      v.array(IsoDateSchema),
      v.minLength(1),
      v.maxLength(DAYS),
      v.check((days) => new Set(days).size === days.length),
    ),
    currency: CurrencyCodeSchema,
    center: LatLngSchema,
  }),
  v.transform(({ name, days, currency, center }): WireTrip => ({
    name,
    days: days.map((date) => ({ date, intro: "" })),
    currency,
    center,
    flights: { out: null, back: null },
    stays: [],
  })),
);

// ---- notes ----

const WireScheduleSchema = v.object({
  date: IsoDateSchema,
  time: v.nullable(IsoTimeSchema),
  status: v.picklist(STATUSES),
});
export type WireSchedule = v.InferOutput<typeof WireScheduleSchema>;

const TagsSchema = v.pipe(v.array(TagSchema), v.maxLength(TAGS));
const BudgetSchema = v.nullable(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1e9)));
/** When a memo's place is open, as OpenStreetMap writes it; OpenStreetMap's own limit on a value */
const HoursSchema = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(255));
/**
 * Whether a memo's plan has to be booked: still to book, by a day or whenever; or booked, with
 * the confirmation's number (may be blank) and its page when there is one
 */
const BookingSchema = v.variant("state", [
  v.object({ state: v.literal("needed"), by: v.nullable(IsoDateSchema) }),
  v.object({
    state: v.literal("booked"),
    code: v.pipe(v.string(), v.trim(), v.maxLength(100)),
    url: v.nullable(HttpUrlSchema),
  }),
]);
export type WireBooking = v.InferOutput<typeof BookingSchema>;
/** How long a memo's plan takes there, in whole minutes: a day at most */
const MinutesSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24 * 60));
/** A point on the desk, as `{ x, y }` within the canvas's bounds */
export const PointSchema = v.object({ x: finite(), y: finite() });

const card = {
  id: NoteIdSchema,
  title: text(TITLE),
  color: ColorSchema,
  x: finite(),
  y: finite(),
  rot: finite(360),
  /** How large the card is drawn, 1 being its own size; a client from before cards could be resized sends none */
  scale: v.optional(scale(), 1),
};

/** Who wrote a note and when: the room's to stamp, never the writer's */
const stamped = { by: MemberIdSchema, updatedAt: IsoInstantSchema };

const memo = {
  ...card,
  kind: v.literal("memo"),
  body: text(BODY),
  tags: TagsSchema,
  mapsUrl: v.nullable(HttpUrlSchema),
  pin: v.nullable(LatLngSchema),
  schedule: v.nullable(WireScheduleSchema),
  budget: BudgetSchema,
  /** Ticked off on a list (the booklet's appendix); separate from a day's status. None from an older client: unticked */
  checked: v.optional(v.boolean(), false),
  /** A picture on the card: the id of an image stored in the room, or null. None from an older client: no picture */
  image: v.optional(v.nullable(ImageIdSchema), null),
  /** How long it takes there, in minutes; null for not said. None from an older client: not said */
  minutes: v.optional(v.nullable(MinutesSchema), null),
  /** When its place is open (`Mo-Fr 10:00-20:00`); null for not said. None from an older client: not said */
  hours: v.optional(v.nullable(HoursSchema), null),
  /** Whether it has to be booked, and how far that has got; null for no booking. None from an older client: none */
  booking: v.optional(v.nullable(BookingSchema), null),
  /** The day it is to be done by, before the trip; null for none. None from an older client: none */
  due: v.optional(v.nullable(IsoDateSchema), null),
  /** Who is to do it; null for whoever. None from an older client: whoever */
  assignee: v.optional(v.nullable(MemberIdSchema), null),
  /** The page its idea came from (a blog, a video), any http(s) link; null for none. None from an older client: none */
  link: v.optional(v.nullable(HttpUrlSchema), null),
};
const suggestion = { ...card, kind: v.literal("suggestion") };
/** Words set straight on the desk, with no paper under them: a heading, a label. `title` is the text */
const textBox = { ...card, kind: v.literal("text"), title: text(TEXT) };
/** A picture stuck straight on the desk: `image` is what it shows; it has no words */
const sticker = { ...card, kind: v.literal("sticker"), image: ImageIdSchema };

/** A note as its writer sends it in `note:add`: who and when are the room's to stamp */
const WireNewNoteSchema = v.variant("kind", [
  v.object(memo),
  v.object(suggestion),
  v.object(textBox),
  v.object(sticker),
]);
export type WireNewNote = v.InferOutput<typeof WireNewNoteSchema>;

const WireMemoSchema = v.object({ ...memo, ...stamped });
export type WireMemo = v.InferOutput<typeof WireMemoSchema>;
export const WireNoteSchema = v.variant("kind", [
  WireMemoSchema,
  v.object({ ...suggestion, ...stamped }),
  v.object({ ...textBox, ...stamped }),
  v.object({ ...sticker, ...stamped }),
]);
export type WireNote = v.InferOutput<typeof WireNoteSchema>;

/** What a memo's `note:update` may change; a field it does not know is a bad message, not one to skip */
const WireMemoPatchSchema = v.strictObject({
  title: v.optional(memo.title),
  body: v.optional(memo.body),
  tags: v.optional(memo.tags),
  checked: v.optional(v.boolean()),
  image: v.optional(v.nullable(ImageIdSchema)),
  color: v.optional(memo.color),
  mapsUrl: v.optional(memo.mapsUrl),
  pin: v.optional(memo.pin),
  schedule: v.optional(memo.schedule),
  budget: v.optional(memo.budget),
  minutes: v.optional(v.nullable(MinutesSchema)),
  hours: v.optional(v.nullable(HoursSchema)),
  booking: v.optional(v.nullable(BookingSchema)),
  due: v.optional(v.nullable(IsoDateSchema)),
  assignee: v.optional(v.nullable(MemberIdSchema)),
  link: v.optional(v.nullable(HttpUrlSchema)),
  x: v.optional(memo.x),
  y: v.optional(memo.y),
  rot: v.optional(memo.rot),
});
export type WireMemoPatch = v.InferOutput<typeof WireMemoPatchSchema>;

// ---- mutations ----

/** Every mutation but `note:add`, the same from the client and from the room */
const mutations = [
  v.object({ type: v.literal("note:update"), id: NoteIdSchema, patch: WireMemoPatchSchema }),
  v.object({ type: v.literal("note:recolor"), id: NoteIdSchema, color: ColorSchema }),
  v.object({ type: v.literal("note:adopt"), id: NoteIdSchema }),
  // what a text box says; empty, it is deleted instead
  v.object({ type: v.literal("text:edit"), id: NoteIdSchema, text: text(TEXT) }),
  // where a card is; as it is turned or resized, how it is turned and how large
  v.object({
    type: v.literal("note:move"),
    id: NoteIdSchema,
    x: finite(),
    y: finite(),
    rot: v.optional(finite(360)),
    scale: v.optional(scale()),
  }),
  v.object({ type: v.literal("note:delete"), id: NoteIdSchema }),
  v.object({ type: v.literal("day:intro"), date: IsoDateSchema, intro: text(INTRO) }),
  v.object({ type: v.literal("member:profile"), ...ProfileSchema.entries }),
  // the trip's name, as written on the desk
  v.object({ type: v.literal("trip:rename"), name: named() }),
  // when the trip is: its first day and how many; everything planned moves with it
  v.object({ type: v.literal("trip:dates"), first: IsoDateSchema, days: count(DAYS) }),
  // one of its flights, or none
  v.object({
    type: v.literal("trip:flight"),
    leg: LegSchema,
    flight: v.nullable(WireFlightSchema),
  }),
  // where the nights are spent: the whole list, as the editor saves it
  v.object({
    type: v.literal("trip:stays"),
    stays: v.pipe(v.array(WireStaySchema), v.maxLength(STAYS)),
  }),
] as const;

/** A mutation as a client sends it: as the room relays it, but a new note unstamped */
const ClientMutationSchema = v.variant("type", [
  v.object({ type: v.literal("note:add"), note: WireNewNoteSchema }),
  ...mutations,
]);
export type ClientMutation = v.InferOutput<typeof ClientMutationSchema>;

/** The app's `Mutation`, as JSON: as the room relays it, a new note stamped */
export const WireMutationSchema = v.variant("type", [
  v.object({ type: v.literal("note:add"), note: WireNoteSchema }),
  ...mutations,
]);
export type WireMutation = v.InferOutput<typeof WireMutationSchema>;

/**
 * The client sends mutations as they are, with an optional `cid` beside the mutation's own
 * fields. A mutation with a `cid` is answered to its sender only: `ack` once it is applied
 * (with the room's `updatedAt`), or `rejected` with that `cid`. A `note:move` without one
 * (a card's position while it is being dragged) is relayed, not kept, and not answered.
 */
export type ClientMessage = ClientMutation & { cid?: Cid };

// ---- what the room sends ----

/** Why the room could not read a message at all */
const UNREAD = ["text only", "too large", "not JSON"] as const;
export type UnreadReason = (typeof UNREAD)[number];

/** Why the room refused a mutation it read */
const REJECT = [
  "too many messages",
  "not a mutation",
  "duplicate id",
  "no such note",
  "no such day",
  "no such image",
  "not a memo",
  "not a text box",
  "not a suggestion",
] as const;
export type RejectReason = (typeof REJECT)[number];

/** Why a member's socket was closed by the room: removed by the owner, left on their own, or the room deleted */
const GONE = ["removed", "left", "deleted"] as const;
export type GoneReason = (typeof GONE)[number];

export const ServerMessageSchema = v.variant("type", [
  v.object({
    type: v.literal("snapshot"),
    me: MemberIdSchema,
    members: v.array(WireMemberSchema),
    trip: WireTripSchema,
    notes: v.array(WireNoteSchema),
  }),
  v.object({
    type: v.literal("mutation"),
    mutation: WireMutationSchema,
    by: MemberIdSchema,
    updatedAt: IsoInstantSchema,
  }),
  v.object({ type: v.literal("ack"), cid: CidSchema, updatedAt: IsoInstantSchema }),
  v.variant("reason", [
    // a message the room could not read: it cannot say which of ours it was
    v.object({ type: v.literal("rejected"), reason: v.picklist(UNREAD) }),
    // a mutation it read and refused; the cid when the message had one
    v.object({
      type: v.literal("rejected"),
      reason: v.picklist(REJECT),
      cid: v.optional(CidSchema),
    }),
  ]),
  // someone joined, was removed or left: who is in the room now
  v.object({ type: v.literal("members"), members: v.array(WireMemberSchema) }),
  // this socket's person is out of the room, or the room was deleted; the socket closes after
  v.object({ type: v.literal("gone"), reason: v.picklist(GONE) }),
]);
export type ServerMessage = v.InferOutput<typeof ServerMessageSchema>;

// ---- checks ----

/** The client's id for one of its mutations, if the message carries a valid one */
export const parseCid = (value: unknown): Cid | null => {
  const result = v.safeParse(v.object({ cid: CidSchema }), value);
  return result.success ? result.output.cid : null;
};

/** A client message as a mutation, or null when it is not one; a new note is stamped by the room */
export function parseMutation(
  value: unknown,
  stamp: Pick<WireNote, "by" | "updatedAt">,
  // the list a flight's airports must be on, passed in so the app never loads it with these checks
  onList: (code: AirportCode) => boolean,
): WireMutation | null {
  const result = v.safeParse(ClientMutationSchema, value);
  if (!result.success) return null;
  const m = result.output;
  if (
    m.type === "trip:flight" &&
    m.flight !== null &&
    !(onList(m.flight.from) && onList(m.flight.to))
  )
    return null;
  return m.type === "note:add" ? { type: "note:add", note: { ...m.note, ...stamp } } : m;
}
