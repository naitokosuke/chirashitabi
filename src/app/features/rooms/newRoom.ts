import { Temporal } from "temporal-polyfill-lite";

import { hexColor } from "../../shared/color";
import { currencyCode } from "../../shared/money";

import type { LatLng } from "../place/types";

import type { NewRoom } from "./types";

/** The Worker's limits on a new room (worker/wire.ts) */
export const MAX_NAME = 60;
export const MAX_DAYS = 60;

/** The room form as the person filled it in, every field as its input holds it */
export interface RoomForm {
  name: string;
  firstDay: string;
  days: number;
  currency: string;
  me: string;
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

/** The form as a room the Worker will accept, or null while it is not one yet */
export function newRoom(form: RoomForm, center: LatLng): NewRoom | null {
  const name = named(form.name);
  const me = named(form.me);
  const first = date(form.firstDay);
  const currency = currencyCode(form.currency);
  const color = hexColor(form.color);
  const days = Number.isInteger(form.days) && form.days >= 1 && form.days <= MAX_DAYS;
  if (name === null || me === null || first === null || currency === null || color === null)
    return null;
  if (!days) return null;
  return { trip: { name, first, days: form.days, currency, center }, me: { name: me, color } };
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
