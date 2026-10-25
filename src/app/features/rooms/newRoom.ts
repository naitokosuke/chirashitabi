import { Temporal } from "temporal-polyfill-lite";

import { parseCurrencyCode, parseHexColor } from "../../../contract";
import type { LatLng } from "../place/types";

import type { NewRoom, Profile } from "./types";

/** The Worker's limits on a new room (src/worker/wire.ts) */
export const MAX_NAME = 60;
export const MAX_DAYS = 60;

/** What the form offers */
export const CURRENCIES = ["TWD", "JPY", "USD", "EUR", "KRW", "THB"] as const;
export const MEMBER_COLORS = [
  "#3c6ee0",
  "#d7263d",
  "#1b998b",
  "#f4a261",
  "#7b2cbf",
  "#2a9d8f",
] as const;
/** Where the map opens for a new trip; the trip's places move it once there are pins */
export const DEFAULT_CENTER = { lat: 25.05, lng: 121.54 };

/**
 * The room form as the person filled it in, every field as its input holds it. No name for
 * the person: for now people are told apart by their color alone, so a name is not asked
 */
export interface RoomForm {
  name: string;
  firstDay: string;
  days: number;
  currency: string;
  color: string;
}

const named = (s: string) => {
  const t = s.trim();
  return t !== "" && t.length <= MAX_NAME ? t : null;
};
const date = (s: string) => {
  try {
    return Temporal.PlainDate.from(s);
  } catch {
    return null;
  }
};

/** A person as the Worker takes one, in `color`, nameless; or null while the color is not one */
export function profileOf(color: string): Profile | null {
  const c = parseHexColor(color);
  return c === null ? null : { name: "", color: c };
}

/** The form as a room the Worker will accept, or null while it is not one yet */
export function newRoom(form: RoomForm, center: LatLng): NewRoom | null {
  const name = named(form.name);
  const me = profileOf(form.color);
  const first = date(form.firstDay);
  const currency = parseCurrencyCode(form.currency);
  const days = Number.isInteger(form.days) && form.days >= 1 && form.days <= MAX_DAYS;
  if (name === null || me === null || first === null || currency === null || !days) return null;
  return { trip: { name, first, days: form.days, currency, center }, me };
}

/** `count` days from `first`, as the ISO dates the room stores */
export const daysFrom = (first: Temporal.PlainDate, count: number): string[] =>
  Array.from({ length: count }, (_, i) => first.add({ days: i }).toString());

/** What `/api/rooms` takes */
export const toWire = (room: NewRoom) => ({
  trip: {
    name: room.trip.name,
    days: daysFrom(room.trip.first, room.trip.days),
    currency: room.trip.currency,
    center: room.trip.center,
  },
  me: room.me,
});
