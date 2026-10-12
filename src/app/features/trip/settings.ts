import { Temporal } from "temporal-polyfill-lite";

import { parseMapsUrl, safeUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";
import { MAX_DAYS, MAX_NAME } from "../rooms/newRoom";

import type { Flight, Flights, Leg, Stay, TripSnapshot } from "./types";

/** The Worker's limits on a flight (worker/wire.ts) */
export const MAX_FLIGHT_NO = 20;
export const MAX_PLACE = 60;

/** A flight as its inputs hold it; `on` is whether the trip has this flight at all */
export interface FlightForm {
  on: boolean;
  number: string;
  from: string;
  to: string;
  /** As `<input type="datetime-local">` holds it: YYYY-MM-DDTHH:MM, or empty */
  departs: string;
  arrives: string;
}

/** A stay as its inputs hold it; the pin it had stays when its link names no point */
export interface StayForm {
  name: string;
  /** As `<input type="date">` holds it */
  checkIn: string;
  nights: number;
  mapsUrl: string;
  pin: LatLng | null;
}

/** The trip's settings as the editor's inputs hold them */
export interface TripForm {
  name: string;
  /** As `<input type="date">` holds it */
  firstDay: string;
  days: number;
  flights: Record<Leg, FlightForm>;
  stays: StayForm[];
}

const local = (t: Temporal.PlainDateTime) => t.toString({ smallestUnit: "minute" });

const flightForm = (f: Flight | null): FlightForm =>
  f === null
    ? { on: false, number: "", from: "", to: "", departs: "", arrives: "" }
    : {
        on: true,
        ...f,
        departs: f.departs === null ? "" : local(f.departs),
        arrives: f.arrives === null ? "" : local(f.arrives),
      };

/** The editor's inputs, filled from the trip as it is */
export const formOf = (trip: TripSnapshot): TripForm => ({
  name: trip.name,
  firstDay: trip.days[0]?.date.toString() ?? Temporal.Now.plainDateISO().toString(),
  days: Math.max(1, trip.days.length),
  flights: { out: flightForm(trip.flights.out), back: flightForm(trip.flights.back) },
  stays: trip.stays.map((s) => ({ ...s, checkIn: s.checkIn.toString(), mapsUrl: s.mapsUrl ?? "" })),
});

/**
 * A stay first added: from the night after the last one ends (the first night of the trip
 * when there is none), for one night
 */
export function newStay(stays: StayForm[], first: Temporal.PlainDate): StayForm {
  const last = stays.at(-1);
  let checkIn = first;
  if (last !== undefined)
    try {
      checkIn = Temporal.PlainDate.from(last.checkIn).add({ days: last.nights });
    } catch {
      // the last one's date is half typed: from the first night
    }
  return { name: "", checkIn: checkIn.toString(), nights: 1, mapsUrl: "", pin: null };
}

/** A stay's inputs as the room takes it, or undefined while it is not one yet */
export function stayOf(f: StayForm): Stay | undefined {
  const name = f.name.trim();
  if (name === "" || name.length > MAX_NAME) return undefined;
  if (!Number.isInteger(f.nights) || f.nights < 1 || f.nights > MAX_DAYS) return undefined;
  let checkIn: Temporal.PlainDate;
  try {
    checkIn = Temporal.PlainDate.from(f.checkIn);
  } catch {
    return undefined;
  }
  // the link is a stay's only way to a place: no link, no pin; one that names no point keeps the pin it had
  const link = f.mapsUrl.trim();
  if (link === "") return { name, checkIn, nights: f.nights, mapsUrl: null, pin: null };
  // only a link the room takes: one it would refuse is not one yet
  if (safeUrl(link) === undefined) return undefined;
  return { name, checkIn, nights: f.nights, mapsUrl: link, pin: parseMapsUrl(link) ?? f.pin };
}

export const sameStays = (a: Stay[], b: Stay[]) =>
  a.length === b.length &&
  a.every((s, i) => {
    const t = b[i]!;
    return (
      s.name === t.name &&
      s.checkIn.equals(t.checkIn) &&
      s.nights === t.nights &&
      s.mapsUrl === t.mapsUrl &&
      s.pin?.lat === t.pin?.lat &&
      s.pin?.lng === t.pin?.lng
    );
  });

/**
 * A flight first added: its airports to name, and its number and times left blank until the
 * ticket says them (the way there is then on the first day, the way home on the last)
 */
export const newFlight = (): FlightForm => ({
  on: true,
  number: "",
  from: "",
  to: "",
  departs: "",
  arrives: "",
});

const dateTime = (s: string) => {
  try {
    return Temporal.PlainDateTime.from(s);
  } catch {
    return null;
  }
};

/**
 * A flight's inputs as the room takes it: null for no flight, undefined while it is not one
 * yet (an airport not named, a time half typed, or more than the room keeps). The number and
 * the times may be blank.
 */
export function flightOf(f: FlightForm): Flight | null | undefined {
  if (!f.on) return null;
  const from = f.from.trim();
  const to = f.to.trim();
  const number = f.number.trim();
  const departs = f.departs === "" ? null : dateTime(f.departs);
  const arrives = f.arrives === "" ? null : dateTime(f.arrives);
  if (from === "" || to === "") return undefined;
  if ((f.departs !== "" && departs === null) || (f.arrives !== "" && arrives === null))
    return undefined;
  if (from.length > MAX_PLACE || to.length > MAX_PLACE || number.length > MAX_FLIGHT_NO)
    return undefined;
  return { number, from, to, departs, arrives };
}

const sameTime = (a: Temporal.PlainDateTime | null, b: Temporal.PlainDateTime | null) =>
  a === null || b === null ? a === b : a.equals(b);

export const sameFlight = (a: Flight | null, b: Flight | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.number === b.number &&
    a.from === b.from &&
    a.to === b.to &&
    sameTime(a.departs, b.departs) &&
    sameTime(a.arrives, b.arrives));

/** The settings the room takes, or null while one of them is not one yet */
export function settingsOf(form: TripForm): {
  name: string;
  first: Temporal.PlainDate;
  days: number;
  flights: Flights;
  stays: Stay[];
} | null {
  const name = form.name.trim();
  if (name === "" || name.length > MAX_NAME) return null;
  let first: Temporal.PlainDate;
  try {
    first = Temporal.PlainDate.from(form.firstDay);
  } catch {
    return null;
  }
  if (!Number.isInteger(form.days) || form.days < 1 || form.days > MAX_DAYS) return null;
  const out = flightOf(form.flights.out);
  const back = flightOf(form.flights.back);
  if (out === undefined || back === undefined) return null;
  const stays = form.stays.map(stayOf);
  if (!stays.every((s) => s !== undefined)) return null;
  return { name, first, days: form.days, flights: { out, back }, stays };
}
