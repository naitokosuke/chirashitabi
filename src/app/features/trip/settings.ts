import { Temporal } from "temporal-polyfill-lite";

import type { Result } from "../../../contract";
import { MAX_DAYS, MAX_FLIGHT_NO, MAX_NAME } from "../../../contract/room";
import { findAirport, type Airport } from "../place/airports";
import { parseHttpUrl, parseMapsUrl } from "../place/google-maps";
import type { LatLng } from "../place/types";

import type { Flight, Flights, Leg, Stay, TripSnapshot } from "./types";

/** A flight as its inputs hold it; `on` is whether the trip has this flight at all */
interface FlightForm {
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

/** A stay's inputs as the room takes it, or which is not one yet */
export function stayOf(f: StayForm): Result<Stay, "name" | "nights" | "check-in" | "link"> {
  const name = f.name.trim();
  if (name === "" || name.length > MAX_NAME) return { ok: false, reason: "name" };
  if (!Number.isInteger(f.nights) || f.nights < 1 || f.nights > MAX_DAYS)
    return { ok: false, reason: "nights" };
  let checkIn: Temporal.PlainDate;
  try {
    checkIn = Temporal.PlainDate.from(f.checkIn);
  } catch {
    return { ok: false, reason: "check-in" };
  }
  const stay = { name, checkIn, nights: f.nights };
  // the link is a stay's only way to a place: no link, no pin; one that names no point keeps the pin it had
  const link = f.mapsUrl.trim();
  if (link === "") return { ok: true, value: { ...stay, mapsUrl: null, pin: null } };
  // only a link the room takes: one it would refuse is not one yet
  const url = parseHttpUrl(link);
  if (url === null) return { ok: false, reason: "link" };
  return { ok: true, value: { ...stay, mapsUrl: url, pin: parseMapsUrl(url) ?? f.pin } };
}

export const sameStays = (a: Stay[], b: Stay[]) =>
  a.length === b.length &&
  a.every((s, i) => {
    const t = b[i];
    return (
      t !== undefined &&
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
 * A flight's inputs as the room takes it (null for no flight), or which is not one yet: an
 * airport not on the list `airports`, a time half typed, or a number longer than the room
 * keeps. The number and the times may be blank; an airport may be typed as its code, its name
 * or a Japanese name, and is taken as its code.
 */
export function flightOf(
  f: FlightForm,
  airports: Airport[],
): Result<Flight | null, "airport" | "time" | "number"> {
  if (!f.on) return { ok: true, value: null };
  const from = findAirport(airports, f.from)?.code;
  const to = findAirport(airports, f.to)?.code;
  const number = f.number.trim();
  const departs = f.departs === "" ? null : dateTime(f.departs);
  const arrives = f.arrives === "" ? null : dateTime(f.arrives);
  if (from === undefined || to === undefined) return { ok: false, reason: "airport" };
  if ((f.departs !== "" && departs === null) || (f.arrives !== "" && arrives === null))
    return { ok: false, reason: "time" };
  if (number.length > MAX_FLIGHT_NO) return { ok: false, reason: "number" };
  return { ok: true, value: { number, from, to, departs, arrives } };
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

/**
 * The settings the room takes, or null while one of them is not one yet; a flight's airports
 * are found among `airports`, so none is taken before they are fetched
 */
export function settingsOf(
  form: TripForm,
  airports: Airport[],
): {
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
  const out = flightOf(form.flights.out, airports);
  const back = flightOf(form.flights.back, airports);
  if (!out.ok || !back.ok) return null;
  const stays: Stay[] = [];
  for (const f of form.stays) {
    const s = stayOf(f);
    if (!s.ok) return null;
    stays.push(s.value);
  }
  return { name, first, days: form.days, flights: { out: out.value, back: back.value }, stays };
}
