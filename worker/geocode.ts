/**
 * Places by name, from OpenStreetMap's geocoder (Nominatim): free, no key, real coordinates.
 * Its usage policy asks for an identifying User-Agent and at most one request a second, which
 * a room of two people asking one memo at a time keeps well under; the caller still spaces
 * its second query (index.ts).
 */

import * as v from "valibot";

import { listOf, type LatLng } from "./types";
import type { Lang } from "./wire";

const NOMINATIM = "https://nominatim.openstreetmap.org";
export const USER_AGENT = "chirashitabi/1.0 (+https://chirashitabi.app)";
/** How many places one query offers to choose from */
export const MAX_PLACES = 3;
/** Nominatim's own pace: one request a second */
export const SPACING_MS = 1100;

export interface Place {
  /** What it is called, in the asker's language where OpenStreetMap has it */
  name: string;
  /** Where it is, as one line (the rest of the place's address) */
  address: string;
  lat: number;
  lng: number;
  /** When it is open, as OpenStreetMap writes it (`Mo-Su 10:00-21:00`); null when it does not say */
  hours: string | null;
}

/** The longest opening hours kept; OpenStreetMap's own limit on a value is 255 */
const HOURS = 255;

/** The places a query finds, best first; null when the geocoder could not be asked */
export async function geocode(env: Env, query: string, lang: Lang): Promise<Place[] | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(MAX_PLACES),
    // the place's own tags beside its address: its opening hours, when it has them
    extratags: "1",
    "accept-language": lang,
  });
  let res: Response;
  try {
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return placesFrom(await res.json().catch(() => null));
}

/** A place's `opening_hours` tag, on one line, or null when it has none */
const HoursSchema = v.fallback(
  v.pipe(
    v.object({ opening_hours: v.string() }),
    v.transform(({ opening_hours }) => {
      const line = opening_hours.replace(/\s+/g, " ").trim();
      return line === "" ? null : line.slice(0, HOURS);
    }),
  ),
  null,
);

/** A coordinate as Nominatim writes it (a decimal string), on the globe */
const coordinate = (max: number) =>
  v.pipe(
    v.union([v.string(), v.number()]),
    v.transform(Number),
    v.finite(),
    v.minValue(-max),
    v.maxValue(max),
  );

/** One place of Nominatim's search answer: a line of its address, and coordinates on the globe */
const HitSchema = v.object({
  name: v.fallback(v.string(), ""),
  display_name: v.string(),
  lat: coordinate(90),
  lon: coordinate(180),
  extratags: HoursSchema,
});

/** Nominatim's answer as places, each one checked: a name, and coordinates on the globe */
export function placesFrom(raw: unknown): Place[] {
  const out: Place[] = [];
  for (const hit of v.parse(listOf(HitSchema), raw)) {
    const parts = hit.display_name.split(",").map((p) => p.trim());
    const title = hit.name.trim() !== "" ? hit.name.trim() : (parts[0] ?? "");
    if (title === "") continue;
    // the address is the line without the name it starts with
    const address = (parts[0] === title ? parts.slice(1) : parts).join(", ");
    out.push({
      name: title.slice(0, 120),
      address: address.slice(0, 240),
      lat: hit.lat,
      lng: hit.lon,
      hours: hit.extratags,
    });
    if (out.length === MAX_PLACES) break;
  }
  return out;
}

/**
 * What is at a point: the place there (a shop, a sight) or, short of one, the street; null
 * inside when OpenStreetMap has nothing there, null outside when it could not be asked
 */
export async function reverseGeocode(
  env: Env,
  at: LatLng,
  lang: Lang,
): Promise<{ place: Place | null } | null> {
  const params = new URLSearchParams({
    lat: String(at.lat),
    lon: String(at.lng),
    format: "jsonv2",
    // a building's level: the shop or the sight the point is on, not the district
    zoom: "18",
    addressdetails: "1",
    extratags: "1",
    "accept-language": lang,
  });
  let res: Response;
  try {
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/reverse?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return { place: placeAt(await res.json().catch(() => null), at) };
}

/** What a place at a point is called, most telling first: never a bare house number */
const NAMED = [
  "tourism",
  "attraction",
  "amenity",
  "shop",
  "leisure",
  "historic",
  "building",
  "road",
  "pedestrian",
  "neighbourhood",
  "quarter",
  "suburb",
] as const;

/** Nominatim's reverse answer: a line of its address, its own name, the parts of its address */
const ReverseSchema = v.object({
  display_name: v.string(),
  name: v.fallback(v.string(), ""),
  // a part that is not words is no name
  address: v.fallback(v.record(v.string(), v.fallback(v.string(), "")), {}),
  extratags: HoursSchema,
});

/**
 * Nominatim's reverse answer as the place at `at`: its own name when it has one (a shop, a
 * sight), else the most telling part of its address (a building, then the street); the point
 * stays the one pinned. Null when there is nothing there (the sea: `{ "error": … }`).
 */
export function placeAt(raw: unknown, at: LatLng): Place | null {
  const r = v.safeParse(ReverseSchema, raw);
  if (!r.success) return null;
  const { display_name: line, address } = r.output;
  const own = r.output.name.trim();
  const part = NAMED.map((k) => address[k]).find((p) => p !== undefined && p.trim() !== "");
  const name = (own !== "" ? own : (part ?? "")).trim();
  if (name === "") return null;
  // the address line, without the name and without what comes before it (a house number)
  const parts = line.split(",").map((p) => p.trim());
  const from = parts.indexOf(name);
  const rest = (from === -1 ? parts : parts.slice(from + 1)).join(", ");
  return {
    name: name.slice(0, 120),
    address: rest.slice(0, 240),
    lat: at.lat,
    lng: at.lng,
    hours: r.output.extratags,
  };
}
