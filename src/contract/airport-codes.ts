import * as v from "valibot";

import {
  AirportCodeSchema,
  airportsOf,
  findAirport,
  type Airport,
  type AirportCode,
} from "./airports";
import rows from "./airports.json";

/**
 * The airports the app suggests (airports.json, OurAirports), for the room to hold a flight to:
 * a flight's from and to are codes on this list, and nothing else
 */
const AIRPORTS: Airport[] = airportsOf(rows);
const CODES = new Set<string>(AIRPORTS.map((a) => a.code));

const AirportCodeOnListSchema = v.pipe(
  AirportCodeSchema,
  v.check((code) => CODES.has(code)),
);

/** A code on the list, exactly as the app writes it */
export const isAirportCode = (value: unknown): value is AirportCode =>
  v.safeParse(AirportCodeOnListSchema, value).success;

/**
 * The airport a flight kept before codes were required names (a code in any case, a name, or a
 * Japanese name), or null when it names none
 */
export const airportCodeOf = (text: string): AirportCode | null =>
  findAirport(AIRPORTS, text)?.code ?? null;
