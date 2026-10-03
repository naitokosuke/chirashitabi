import { hexColor } from "../src/app/shared/color";
/**
 * What crosses the socket, and the checks it must pass. Temporal values travel
 * as the ISO strings `JSON.stringify` makes of them; the app revives them.
 * Nothing from the client is trusted: every field is checked here before a room acts.
 */
import { currencyCode } from "../src/app/shared/money";

import { COLORS, type NoteColor, type NoteStatus } from "../src/app/features/notes/types";

export interface WireMember {
  id: string;
  kind: "person" | "agent";
  name: string;
  color: string;
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
}

export interface WireSuggestion extends WireCard {
  kind: "suggestion";
}

export type WireNote = WireMemo | WireSuggestion;

/** What a memo's `note:update` may change */
export type WireMemoPatch = Partial<
  Pick<
    WireMemo,
    | "title"
    | "body"
    | "tags"
    | "checked"
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
  | { type: "note:move"; id: string; x: number; y: number }
  | { type: "note:delete"; id: string }
  | { type: "day:intro"; date: string; intro: string }
  | { type: "member:profile"; name: string; color: string };

/**
 * The client sends mutations as they are, with an optional `cid` beside the mutation's own
 * fields. A mutation with a `cid` is answered to its sender only: `ack` once it is applied
 * (with the room's `updatedAt`), or `rejected` with that `cid`. One without (a card's
 * position while it is being dragged) is relayed and not answered.
 */
export type ClientMessage = WireMutation & { cid?: string };

export type ServerMessage =
  | { type: "snapshot"; me: string; members: WireMember[]; trip: WireTrip; notes: WireNote[] }
  | { type: "mutation"; mutation: WireMutation; by: string; updatedAt: string }
  | { type: "ack"; cid: string; updatedAt: string }
  | { type: "rejected"; reason: string; cid?: string };

/** The client's id for one of its mutations, if the message carries a valid one */
export const parseCid = (v: unknown): string | null => (isRecord(v) && isId(v.cid) ? v.cid : null);

export const MAX_MESSAGE_BYTES = 32 * 1024;

// ---- limits ----
const TITLE = 200;
const BODY = 4000;
const TAG = 40;
const TAGS = 20;
const INTRO = 1000;
const NAME = 60;
const URL_LEN = 2000;
const ID = 64;
const COORD = 1e6;
const DAYS = 60;

// ---- checks ----
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isFinite_ = (v: unknown, max = COORD): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
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
const isTags = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= TAGS && v.every((t) => isText(t, TAG) && t !== "");
const isSchedule = (v: unknown): v is WireSchedule =>
  isRecord(v) && isDate(v.date) && (v.time === null || isTime(v.time)) && isStatus(v.status);
const isBudget = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9);

/** The profile a person sets for themselves */
export const parseProfile = (v: unknown): { name: string; color: string } | null =>
  isRecord(v) && isText(v.name, NAME) && v.name.trim() !== "" && hexColor(String(v.color)) !== null
    ? { name: v.name.trim(), color: String(v.color).toLowerCase() }
    : null;

/** What a room is created with */
export const parseTrip = (v: unknown): WireTrip | null => {
  if (!isRecord(v)) return null;
  if (!isText(v.name, NAME) || v.name.trim() === "") return null;
  if (!Array.isArray(v.days) || v.days.length > DAYS || !v.days.every(isDate)) return null;
  if (new Set(v.days).size !== v.days.length) return null;
  if (typeof v.currency !== "string" || currencyCode(v.currency) === null) return null;
  if (!isLatLng(v.center)) return null;
  return {
    name: v.name.trim(),
    days: v.days.map((date) => ({ date, intro: "" })),
    currency: v.currency,
    center: v.center,
  };
};

/** A note as the client may send it in `note:add`; `by` and `updatedAt` are the room's to set */
const parseNote = (v: unknown): WireNote | null => {
  if (!isRecord(v)) return null;
  if (!isId(v.id) || !isText(v.title, TITLE) || !isColor(v.color)) return null;
  if (!isFinite_(v.x) || !isFinite_(v.y) || !isFinite_(v.rot, 360)) return null;
  const card = {
    id: v.id,
    title: v.title,
    color: v.color,
    x: v.x,
    y: v.y,
    rot: v.rot,
    by: "",
    updatedAt: "",
  };
  if (v.kind === "suggestion") return { ...card, kind: "suggestion" };
  if (v.kind !== "memo") return null;
  if (!isText(v.body, BODY) || !isTags(v.tags)) return null;
  if (!(v.mapsUrl === null || isUrl(v.mapsUrl))) return null;
  if (!(v.pin === null || isLatLng(v.pin))) return null;
  if (!(v.schedule === null || isSchedule(v.schedule))) return null;
  if (!isBudget(v.budget)) return null;
  // a client from before `checked` existed sends none: unticked
  if (!(v.checked === undefined || typeof v.checked === "boolean")) return null;
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
    case "note:move":
      return isId(v.id) && isFinite_(v.x) && isFinite_(v.y)
        ? { type: "note:move", id: v.id, x: v.x, y: v.y }
        : null;
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
    default:
      return null;
  }
}
