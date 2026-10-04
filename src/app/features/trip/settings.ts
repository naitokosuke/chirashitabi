import { Temporal } from "temporal-polyfill-lite";

import { MAX_DAYS, MAX_NAME } from "../rooms/newRoom";

import type { Flight, Flights, Leg, TripSnapshot } from "./types";

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

/** The trip's settings as the editor's inputs hold them */
export interface TripForm {
  name: string;
  /** As `<input type="date">` holds it */
  firstDay: string;
  days: number;
  flights: Record<Leg, FlightForm>;
}

const local = (t: Temporal.PlainDateTime) => t.toString({ smallestUnit: "minute" });

const flightForm = (f: Flight | null): FlightForm =>
  f === null
    ? { on: false, number: "", from: "", to: "", departs: "", arrives: "" }
    : { on: true, ...f, departs: local(f.departs), arrives: local(f.arrives) };

/** The editor's inputs, filled from the trip as it is */
export const formOf = (trip: TripSnapshot): TripForm => ({
  name: trip.name,
  firstDay: trip.days[0]?.date.toString() ?? Temporal.Now.plainDateISO().toString(),
  days: Math.max(1, trip.days.length),
  flights: { out: flightForm(trip.flights.out), back: flightForm(trip.flights.back) },
});

/**
 * A flight first added: the way there leaves on the first day, the way home on the last, at a
 * plausible hour the person then corrects
 */
export function newFlight(leg: Leg, first: Temporal.PlainDate, days: number): FlightForm {
  const day = leg === "out" ? first : first.add({ days: days - 1 });
  const [departs, arrives] = leg === "out" ? ["09:00", "12:00"] : ["17:00", "21:00"];
  return {
    on: true,
    number: "",
    from: "",
    to: "",
    departs: `${day}T${departs}`,
    arrives: `${day}T${arrives}`,
  };
}

const dateTime = (s: string) => {
  try {
    return Temporal.PlainDateTime.from(s);
  } catch {
    return null;
  }
};

/**
 * A flight's inputs as the room takes it: null for no flight, undefined while it is not one
 * yet (a place not named, a time not set, or more than the room keeps)
 */
export function flightOf(f: FlightForm): Flight | null | undefined {
  if (!f.on) return null;
  const from = f.from.trim();
  const to = f.to.trim();
  const number = f.number.trim();
  const departs = dateTime(f.departs);
  const arrives = dateTime(f.arrives);
  if (from === "" || to === "" || departs === null || arrives === null) return undefined;
  if (from.length > MAX_PLACE || to.length > MAX_PLACE || number.length > MAX_FLIGHT_NO)
    return undefined;
  return { number, from, to, departs, arrives };
}

export const sameFlight = (a: Flight | null, b: Flight | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.number === b.number &&
    a.from === b.from &&
    a.to === b.to &&
    a.departs.equals(b.departs) &&
    a.arrives.equals(b.arrives));

/** The settings the room takes, or null while one of them is not one yet */
export function settingsOf(
  form: TripForm,
): { name: string; first: Temporal.PlainDate; days: number; flights: Flights } | null {
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
  return { name, first, days: form.days, flights: { out, back } };
}
