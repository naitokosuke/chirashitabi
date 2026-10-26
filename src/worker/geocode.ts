/**
 * Places by name, from OpenStreetMap's geocoder (Nominatim): free, no key, real coordinates.
 * Its usage policy asks for an identifying User-Agent and at most one request a second for the
 * whole app: each request waits for its turn, which the one RoomsIndex hands out, and is cut
 * off after a timeout.
 */

import * as v from "valibot";

import { listOf, type Email, type Result } from "../contract";
import type { LatLng } from "../contract/place";
import type { Lang } from "../contract/wire";

const NOMINATIM = "https://nominatim.openstreetmap.org";
export const USER_AGENT = "chirashitabi/1.0 (+https://chirashitabi.app)";
/** How many places one query offers to choose from */
export const MAX_PLACES = 3;
/** Nominatim's own pace: one request a second */
export const SPACING_MS = 1100;
/** How long a request may take before it is given up */
const TIMEOUT_MS = 8000;

/**
 * Why the geocoder answered nothing: its turns ran too far ahead, or the asker's free lookups
 * hold their share of them, and it was not asked ("busy"); or it was asked and did not answer
 */
export type GeocoderFailure = "busy" | "failed";

/**
 * Waits for the app's turn at the geocoder (RoomsIndex.geocoderTurn), for a free lookup by
 * `free` or a budgeted one (null); false when there is no turn, and it is not asked
 */
async function turn(env: Env, free: Email | null): Promise<boolean> {
  const wait = await env.ROOMS.getByName("index").geocoderTurn(free);
  if (wait === null) return false;
  await new Promise((r) => setTimeout(r, wait));
  return true;
}

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

/**
 * The places a query finds, best first, looked up free for `free` or within a budget (null);
 * or why there are none to give
 */
export async function geocode(
  env: Env,
  query: string,
  lang: Lang,
  free: Email | null,
): Promise<Result<Place[], GeocoderFailure>> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(MAX_PLACES),
    // the place's own tags beside its address: its opening hours, when it has them
    extratags: "1",
    "accept-language": lang,
  });
  if (!(await turn(env, free))) return { ok: false, reason: "busy" };
  let res: Response;
  try {
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/search?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!res.ok) return { ok: false, reason: "failed" };
  return { ok: true, value: placesFrom(await res.json().catch(() => null)) };
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
 * What is at a point, looked up free for `free`: the place there (a shop, a sight) or, short
 * of one, the street, null when OpenStreetMap has nothing there; or why it could not be told
 */
export async function reverseGeocode(
  env: Env,
  at: LatLng,
  lang: Lang,
  free: Email,
): Promise<Result<{ place: Place | null }, GeocoderFailure>> {
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
  if (!(await turn(env, free))) return { ok: false, reason: "busy" };
  let res: Response;
  try {
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/reverse?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!res.ok) return { ok: false, reason: "failed" };
  return { ok: true, value: { place: placeAt(await res.json().catch(() => null), at) } };
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
