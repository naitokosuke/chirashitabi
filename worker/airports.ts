import {
  airportOf,
  findAirport,
  type Airport,
  type AirportCode,
  type AirportRow,
} from "../src/app/features/place/airports";
import rows from "../src/app/features/place/airports.json";

/**
 * The airports the app suggests (airports.json, OurAirports), for the room to hold a flight to:
 * a flight's from and to are codes on this list, and nothing else
 */
const AIRPORTS: Airport[] = (rows as unknown as AirportRow[]).map(airportOf);
const CODES = new Set<string>(AIRPORTS.map((a) => a.code));

/** A code on the list, exactly as the app writes it */
export const isAirportCode = (v: unknown): v is AirportCode =>
  typeof v === "string" && CODES.has(v);

/**
 * The airport a flight kept before codes were required names (a code in any case, a name, or a
 * Japanese name), or null when it names none
 */
export const airportCodeOf = (text: string): AirportCode | null =>
  findAirport(AIRPORTS, text)?.code ?? null;
