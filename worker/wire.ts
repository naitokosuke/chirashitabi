import { hexColor } from "../src/app/shared/color";
/**
 * What crosses the socket, and the checks it must pass. Temporal values travel
 * as the ISO strings `JSON.stringify` makes of them; the app revives them.
 * Nothing from the client is trusted: every field is checked here before a room acts.
 */
import { currencyCode } from "../src/app/shared/money";

import { COLORS, type NoteColor, type NoteStatus } from "../src/app/features/notes/types";

/** A person says whether they made the room; an agent has no say in who is in it */
export type WireMember =
  | { id: string; kind: "person"; role: "owner" | "guest"; name: string; color: string }
  | { id: string; kind: "agent"; name: string; color: string };

/** A room as `/api/me` lists it: the trip at a glance, without its notes */
export interface WireRoomSummary {
  name: string;
  first: string | null; // YYYY-MM-DD, the first day; null while the trip has none
  days: number;
  members: Omit<WireMember, "id">[];
  memos: number;
  /** Whether the person asking made the trip, and so may delete it (false on an invitation) */
  owner: boolean;
}

export interface WireDay {
  date: string; // YYYY-MM-DD
  intro: string;
}

export interface WireTrip {
  name: string;
  days: WireDay[];
  currency: string;
  center: { lat: number; lng: number };
  /** The flight there and the flight home, each or both not known yet */
  flights: WireFlights;
  /** Where the nights are spent, in the order they come */
  stays: WireStay[];
}

/** Which flight: the one there, or the one home */
export type Leg = "out" | "back";

/**
 * A flight as the travellers write it from their ticket: its number, where it leaves from and
 * lands (a code or a name), and when, in each airport's own local time (YYYY-MM-DDTHH:MM). The
 * landing may read earlier than the leaving, across time zones, so their order is not checked.
 */
export interface WireFlight {
  number: string;
  from: string;
  to: string;
  departs: string;
  arrives: string;
}

export type WireFlights = Record<Leg, WireFlight | null>;

/**
 * Where the travellers sleep: a name, the first night (YYYY-MM-DD) and how many, and where it
 * is, as a Google Maps link and the point it names, when they gave one
 */
export interface WireStay {
  name: string;
  checkIn: string;
  nights: number;
  mapsUrl: string | null;
  pin: { lat: number; lng: number } | null;
}

export interface WireSchedule {
  date: string;
  time: string | null; // HH:MM:SS
  status: NoteStatus;
}

interface WireCard {
  id: string;
  title: string;
  color: NoteColor;
  x: number;
  y: number;
  rot: number;
  /** How large the card is drawn, 1 being its own size (MIN_SCALE to MAX_SCALE) */
  scale: number;
  by: string;
  updatedAt: string; // ISO instant
}

export interface WireMemo extends WireCard {
  kind: "memo";
  body: string;
  tags: string[];
  mapsUrl: string | null;
  pin: { lat: number; lng: number } | null;
  schedule: WireSchedule | null;
  budget: number | null;
  /** Ticked off on a list (the booklet's appendix); separate from a day's status */
  checked: boolean;
  /** A picture on the card: the id of an image stored in the room, or null */
  image: string | null;
}

export interface WireSuggestion extends WireCard {
  kind: "suggestion";
}

/** Words set straight on the desk, with no paper under them: a heading, a label. `title` is the text */
export interface WireText extends WireCard {
  kind: "text";
}

export type WireNote = WireMemo | WireSuggestion | WireText;

/** What a memo's `note:update` may change */
export type WireMemoPatch = Partial<
  Pick<
    WireMemo,
    | "title"
    | "body"
    | "tags"
    | "checked"
    | "image"
    | "color"
    | "mapsUrl"
    | "pin"
    | "schedule"
    | "budget"
    | "x"
    | "y"
    | "rot"
  >
>;

/** The app's `Mutation`, as JSON */
export type WireMutation =
  | { type: "note:add"; note: WireNote }
  | { type: "note:update"; id: string; patch: WireMemoPatch }
  | { type: "note:recolor"; id: string; color: NoteColor }
  | { type: "note:adopt"; id: string }
  // what a text box says; empty, it is deleted instead
  | { type: "text:edit"; id: string; text: string }
  // where a card is; as it is turned or resized, how it is turned and how large
  | { type: "note:move"; id: string; x: number; y: number; rot?: number; scale?: number }
  | { type: "note:delete"; id: string }
  | { type: "day:intro"; date: string; intro: string }
  | { type: "member:profile"; name: string; color: string }
  // the trip's name, as written on the desk
  | { type: "trip:rename"; name: string }
  // when the trip is: its first day and how many; everything planned moves with it
  | { type: "trip:dates"; first: string; days: number }
  // one of its flights, or none
  | { type: "trip:flight"; leg: Leg; flight: WireFlight | null }
  // where the nights are spent: the whole list, as the editor saves it
  | { type: "trip:stays"; stays: WireStay[] };

/**
 * The client sends mutations as they are, with an optional `cid` beside the mutation's own
 * fields. A mutation with a `cid` is answered to its sender only: `ack` once it is applied
 * (with the room's `updatedAt`), or `rejected` with that `cid`. A `note:move` without one
 * (a card's position while it is being dragged) is relayed, not kept, and not answered.
 */
export type ClientMessage = WireMutation & { cid?: string };

export type ServerMessage =
  | { type: "snapshot"; me: string; members: WireMember[]; trip: WireTrip; notes: WireNote[] }
  | { type: "mutation"; mutation: WireMutation; by: string; updatedAt: string }
  | { type: "ack"; cid: string; updatedAt: string }
  | { type: "rejected"; reason: string; cid?: string }
  // someone joined, was removed or left: who is in the room now
  | { type: "members"; members: WireMember[] }
  // this socket's person is out of the room, or the room was deleted; the socket closes after
  | { type: "gone"; reason: GoneReason };

/** Why a member's socket was closed by the room: removed by the owner, left on their own, or the room deleted */
export type GoneReason = "removed" | "left" | "deleted";

/** The client's id for one of its mutations, if the message carries a valid one */
export const parseCid = (v: unknown): string | null => (isRecord(v) && isId(v.cid) ? v.cid : null);

export const MAX_MESSAGE_BYTES = 32 * 1024;

// ---- limits ----
const TITLE = 200;
/** A text box's words: a few lines at most */
const TEXT = 1000;
const BODY = 4000;
const TAG = 40;
const TAGS = 20;
const INTRO = 1000;
const NAME = 60;
const URL_LEN = 2000;
const ID = 64;
const COORD = 1e6;
const DAYS = 60;
const FLIGHT_NO = 20;
const PLACE = 60;
/** Stays in a trip: one a night at most, for a trip as long as it may be */
const STAYS = DAYS;

// ---- checks ----
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isFinite_ = (v: unknown, max = COORD): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
/** How small and how large a card may be drawn, its own size being 1 */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
const isScale = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MIN_SCALE && v <= MAX_SCALE;

/** An image's id, as the room mints it (a UUID) */
export const isImageId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

/** What a picture may be, as uploaded: the formats every browser shows */
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
/** The largest picture, in bytes; the app shrinks one to well under this before sending it */
export const MAX_IMAGE_BYTES = 1024 * 1024;

const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) && v.length <= ID;
const isColor = (v: unknown): v is NoteColor => (COLORS as readonly string[]).includes(v as string);
const STATUSES: readonly NoteStatus[] = ["idea", "fixed", "done"];
const isStatus = (v: unknown): v is NoteStatus => STATUSES.includes(v as NoteStatus);

export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
};
const isTime = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  return m !== null && Number(m[1]) < 24 && Number(m[2]) < 60 && Number(m[3] ?? 0) < 60;
};
const isUrl = (v: unknown): v is string => {
  if (!isText(v, URL_LEN)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};
const isLatLng = (v: unknown): v is { lat: number; lng: number } =>
  isRecord(v) && isFinite_(v.lat, 90) && isFinite_(v.lng, 180) && Object.keys(v).length === 2;
/** A point on the desk, as `{ x, y }` within the canvas's bounds */
export const parsePoint = (v: unknown): { x: number; y: number } | null =>
  isRecord(v) && isFinite_(v.x) && isFinite_(v.y) ? { x: v.x, y: v.y } : null;
const isTags = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= TAGS && v.every((t) => isText(t, TAG) && t !== "");
const isSchedule = (v: unknown): v is WireSchedule =>
  isRecord(v) && isDate(v.date) && (v.time === null || isTime(v.time)) && isStatus(v.status);
const isBudget = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9);

/** The profile a person sets for themselves; the name may be blank, people are told apart by color for now */
export const parseProfile = (v: unknown): { name: string; color: string } | null =>
  isRecord(v) && isText(v.name, NAME) && hexColor(String(v.color)) !== null
    ? { name: v.name.trim(), color: String(v.color).toLowerCase() }
    : null;

/**
 * An e-mail address to invite, lowercased as the index keeps it, or null. Only its shape is
 * checked; whether it can log in is Access's to say.
 */
export const parseEmail = (v: unknown): string | null =>
  typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    ? v.trim().toLowerCase()
    : null;

/** A local date and time, to the minute or the second (as Temporal writes one) */
export const isDateTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v) &&
  isDate(v.slice(0, 10)) &&
  isTime(v.slice(11));

/** A flight as a member writes it, trimmed; a place must be named, the number may be blank */
const parseFlight = (v: unknown): WireFlight | null => {
  if (!isRecord(v)) return null;
  const { number, from, to, departs, arrives } = v;
  if (!isText(number, FLIGHT_NO) || !isText(from, PLACE) || !isText(to, PLACE)) return null;
  if (from.trim() === "" || to.trim() === "") return null;
  if (!isDateTime(departs) || !isDateTime(arrives)) return null;
  // kept to the minute, as a ticket says it
  return {
    number: number.trim(),
    from: from.trim(),
    to: to.trim(),
    departs: departs.slice(0, 16),
    arrives: arrives.slice(0, 16),
  };
};

/** A stay as a member writes it, its name trimmed; its nights within a trip's length */
const parseStay = (v: unknown): WireStay | null => {
  if (!isRecord(v)) return null;
  const { name, checkIn, nights, mapsUrl, pin } = v;
  if (!isText(name, NAME) || name.trim() === "" || !isDate(checkIn)) return null;
  if (typeof nights !== "number" || !Number.isInteger(nights) || nights < 1 || nights > DAYS)
    return null;
  if (!(mapsUrl === null || isUrl(mapsUrl)) || !(pin === null || isLatLng(pin))) return null;
  return { name: name.trim(), checkIn, nights, mapsUrl, pin };
};

/** What a room is created with */
export const parseTrip = (v: unknown): WireTrip | null => {
  if (!isRecord(v)) return null;
  if (!isText(v.name, NAME) || v.name.trim() === "") return null;
  if (!Array.isArray(v.days) || v.days.length === 0 || v.days.length > DAYS) return null;
  if (!v.days.every(isDate)) return null;
  if (new Set(v.days).size !== v.days.length) return null;
  if (typeof v.currency !== "string" || currencyCode(v.currency) === null) return null;
  if (!isLatLng(v.center)) return null;
  return {
    name: v.name.trim(),
    days: v.days.map((date) => ({ date, intro: "" })),
    currency: v.currency,
    center: v.center,
    flights: { out: null, back: null },
    stays: [],
  };
};

/** A note as the client may send it in `note:add`; `by` and `updatedAt` are the room's to set */
const parseNote = (v: unknown): WireNote | null => {
  if (!isRecord(v)) return null;
  const max = v.kind === "text" ? TEXT : TITLE;
  if (!isId(v.id) || !isText(v.title, max) || !isColor(v.color)) return null;
  if (!isFinite_(v.x) || !isFinite_(v.y) || !isFinite_(v.rot, 360)) return null;
  // a client from before cards could be resized sends no scale: its own size
  if (!(v.scale === undefined || isScale(v.scale))) return null;
  const card = {
    id: v.id,
    title: v.title,
    color: v.color,
    x: v.x,
    y: v.y,
    rot: v.rot,
    scale: v.scale ?? 1,
    by: "",
    updatedAt: "",
  };
  if (v.kind === "suggestion") return { ...card, kind: "suggestion" };
  if (v.kind === "text") return { ...card, kind: "text" };
  if (v.kind !== "memo") return null;
  if (!isText(v.body, BODY) || !isTags(v.tags)) return null;
  if (!(v.mapsUrl === null || isUrl(v.mapsUrl))) return null;
  if (!(v.pin === null || isLatLng(v.pin))) return null;
  if (!(v.schedule === null || isSchedule(v.schedule))) return null;
  if (!isBudget(v.budget)) return null;
  // a client from before `checked` existed sends none: unticked
  if (!(v.checked === undefined || typeof v.checked === "boolean")) return null;
  // and one from before pictures sends no image: none
  if (!(v.image === undefined || v.image === null || isImageId(v.image))) return null;
  return {
    ...card,
    kind: "memo",
    body: v.body,
    tags: v.tags,
    mapsUrl: v.mapsUrl,
    pin: v.pin,
    schedule: v.schedule,
    budget: v.budget,
    checked: v.checked ?? false,
    image: v.image ?? null,
  };
};

const parsePatch = (v: unknown): WireMemoPatch | null => {
  if (!isRecord(v)) return null;
  const p: WireMemoPatch = {};
  for (const [k, val] of Object.entries(v)) {
    switch (k) {
      case "title":
        if (!isText(val, TITLE)) return null;
        p.title = val;
        break;
      case "body":
        if (!isText(val, BODY)) return null;
        p.body = val;
        break;
      case "tags":
        if (!isTags(val)) return null;
        p.tags = val;
        break;
      case "color":
        if (!isColor(val)) return null;
        p.color = val;
        break;
      case "mapsUrl":
        if (!(val === null || isUrl(val))) return null;
        p.mapsUrl = val;
        break;
      case "pin":
        if (!(val === null || isLatLng(val))) return null;
        p.pin = val;
        break;
      case "schedule":
        if (!(val === null || isSchedule(val))) return null;
        p.schedule = val;
        break;
      case "budget":
        if (!isBudget(val)) return null;
        p.budget = val;
        break;
      case "checked":
        if (typeof val !== "boolean") return null;
        p.checked = val;
        break;
      case "image":
        if (!(val === null || isImageId(val))) return null;
        p.image = val;
        break;
      case "x":
      case "y":
        if (!isFinite_(val)) return null;
        p[k] = val;
        break;
      case "rot":
        if (!isFinite_(val, 360)) return null;
        p.rot = val;
        break;
      default:
        return null; // an unknown field is a bad message, not something to skip
    }
  }
  return p;
};

/** A client message as a mutation, or null when it is not one */
export function parseMutation(v: unknown): WireMutation | null {
  if (!isRecord(v)) return null;
  switch (v.type) {
    case "note:add": {
      const note = parseNote(v.note);
      return note === null ? null : { type: "note:add", note };
    }
    case "note:update": {
      const patch = parsePatch(v.patch);
      return isId(v.id) && patch !== null ? { type: "note:update", id: v.id, patch } : null;
    }
    case "note:recolor":
      return isId(v.id) && isColor(v.color)
        ? { type: "note:recolor", id: v.id, color: v.color }
        : null;
    case "note:adopt":
      return isId(v.id) ? { type: "note:adopt", id: v.id } : null;
    case "text:edit":
      return isId(v.id) && isText(v.text, TEXT)
        ? { type: "text:edit", id: v.id, text: v.text }
        : null;
    case "note:move": {
      if (!isId(v.id) || !isFinite_(v.x) || !isFinite_(v.y)) return null;
      if (!(v.rot === undefined || isFinite_(v.rot, 360))) return null;
      if (!(v.scale === undefined || isScale(v.scale))) return null;
      return {
        type: "note:move",
        id: v.id,
        x: v.x,
        y: v.y,
        ...(v.rot === undefined ? {} : { rot: v.rot }),
        ...(v.scale === undefined ? {} : { scale: v.scale }),
      };
    }
    case "note:delete":
      return isId(v.id) ? { type: "note:delete", id: v.id } : null;
    case "day:intro":
      return isDate(v.date) && isText(v.intro, INTRO)
        ? { type: "day:intro", date: v.date, intro: v.intro }
        : null;
    case "member:profile": {
      const profile = parseProfile(v);
      return profile === null ? null : { type: "member:profile", ...profile };
    }
    case "trip:dates":
      return isDate(v.first) &&
        Number.isInteger(v.days) &&
        (v.days as number) >= 1 &&
        (v.days as number) <= DAYS
        ? { type: "trip:dates", first: v.first, days: v.days as number }
        : null;
    case "trip:flight": {
      if (v.leg !== "out" && v.leg !== "back") return null;
      if (v.flight === null) return { type: "trip:flight", leg: v.leg, flight: null };
      const flight = parseFlight(v.flight);
      return flight === null ? null : { type: "trip:flight", leg: v.leg, flight };
    }
    case "trip:stays": {
      if (!Array.isArray(v.stays) || v.stays.length > STAYS) return null;
      const stays = v.stays.map(parseStay);
      return stays.every((s) => s !== null) ? { type: "trip:stays", stays } : null;
    }
    case "trip:rename":
      return isText(v.name, NAME) && v.name.trim() !== ""
        ? { type: "trip:rename", name: v.name.trim() }
        : null;
    default:
      return null;
  }
}
