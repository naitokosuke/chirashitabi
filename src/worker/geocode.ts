/**
 * Places by name, from OpenStreetMap's geocoder (Nominatim): free, no key, real coordinates.
 * Its usage policy asks for an identifying User-Agent and at most one request a second for the
 * whole app: each request waits for its turn, which the one RoomsIndex hands out, and is cut
 * off after a timeout. It also asks that answers be kept rather than asked for again: each one
 * is kept for KEPT_FOR in the Workers Cache, and a question answered there takes no turn.
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
 * Why the geocoder answered nothing: its turns ran too far ahead, or the asker's lookups hold
 * their share of them, and it was not asked ("busy"); or it was asked and did not answer
 */
export type GeocoderFailure = "busy" | "failed";

/**
 * Waits for the app's turn at the geocoder (RoomsIndex.geocoderTurn), for a lookup `asker`
 * makes; false when there is no turn, and it is not asked
 */
async function turn(env: Env, asker: Email): Promise<boolean> {
  const wait = await env.ROOMS.getByName("index").geocoderTurn(asker);
  if (wait === null) return false;
  await new Promise((r) => setTimeout(r, wait));
  return true;
}

/** How long an answer is kept, in seconds: a week, since places change slowly */
const KEPT_FOR = 7 * 24 * 60 * 60;

/**
 * Nominatim's answer at `path` to `params`: the one kept under `key` (the question as asked,
 * written one way, which names a cache entry and is never sent) when there is one; else asked
 * in the app's turn for `asker`, and kept when it is an answer. A failure is not kept, so the
 * next lookup asks again.
 */
async function lookUp(
  env: Env,
  path: "/search" | "/reverse",
  params: URLSearchParams,
  key: URLSearchParams,
  asker: Email,
): Promise<Result<unknown, GeocoderFailure>> {
  const base = env.GEOCODER_BASE_URL ?? NOMINATIM;
  const entry = new Request(`${base}${path}?${key.toString()}`);
  const kept = await caches.default.match(entry);
  if (kept !== undefined) return { ok: true, value: await kept.json().catch(() => null) };
  if (!(await turn(env, asker))) return { ok: false, reason: "busy" };
  let text: string;
  try {
    const res = await fetch(`${base}${path}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: "failed" };
    text = await res.text();
  } catch {
    return { ok: false, reason: "failed" };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // an answer that is no JSON is none, and not kept
    return { ok: true, value: null };
  }
  await caches.default.put(
    entry,
    new Response(text, {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${KEPT_FOR}` },
    }),
  );
  return { ok: true, value };
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
 * The places a query finds, best first, looked up for `asker`, free or within their budget; or
 * why there are none to give
 */
export async function geocode(
  env: Env,
  query: string,
  lang: Lang,
  asker: Email,
): Promise<Result<Place[], GeocoderFailure>> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(MAX_PLACES),
    // the place's own tags beside its address: its opening hours, when it has them
    extratags: "1",
    "accept-language": lang,
  });
  // kept under the query however it was spaced, cased or its characters' widths written: the
  // geocoder answers those the same
  const key = new URLSearchParams(params);
  key.set("q", query.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase());
  const answer = await lookUp(env, "/search", params, key, asker);
  return answer.ok ? { ok: true, value: placesFrom(answer.value) } : answer;
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
 * What is at a point, looked up free for `asker`: the place there (a shop, a sight) or, short
 * of one, the street, null when OpenStreetMap has nothing there; or why it could not be told
 */
export async function reverseGeocode(
  env: Env,
  at: LatLng,
  lang: Lang,
  asker: Email,
): Promise<Result<{ place: Place | null }, GeocoderFailure>> {
  // asked, and kept, at the point to a metre or so: a pin a touch off is the same place
  const round = (n: number) => String(Math.round(n * 1e5) / 1e5);
  const params = new URLSearchParams({
    lat: round(at.lat),
    lon: round(at.lng),
    format: "jsonv2",
    // a building's level: the shop or the sight the point is on, not the district
    zoom: "18",
    addressdetails: "1",
    extratags: "1",
    "accept-language": lang,
  });
  const answer = await lookUp(env, "/reverse", params, params, asker);
  return answer.ok ? { ok: true, value: { place: placeAt(answer.value, at) } } : answer;
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
