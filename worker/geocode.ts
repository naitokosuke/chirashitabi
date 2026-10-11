/**
 * Places by name, from OpenStreetMap's geocoder (Nominatim): free, no key, real coordinates.
 * Its usage policy asks for an identifying User-Agent and at most one request a second, which
 * a room of two people asking one memo at a time keeps well under; the caller still spaces
 * its second query (index.ts).
 */

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
export async function geocode(env: Env, query: string, lang: "ja" | "en"): Promise<Place[] | null> {
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
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return placesFrom(await res.json().catch(() => null));
}

/** Nominatim's answer as places, each one checked: a name, and coordinates on the globe */
export function placesFrom(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  const out: Place[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const { name, display_name: line, lat, lon, extratags } = r as Record<string, unknown>;
    const la = Number(lat);
    const ln = Number(lon);
    if (typeof line !== "string" || !Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) continue;
    const parts = line.split(",").map((p) => p.trim());
    const title = typeof name === "string" && name.trim() !== "" ? name.trim() : (parts[0] ?? "");
    if (title === "") continue;
    // the address is the line without the name it starts with
    const address = (parts[0] === title ? parts.slice(1) : parts).join(", ");
    out.push({
      name: title.slice(0, 120),
      address: address.slice(0, 240),
      lat: la,
      lng: ln,
      hours: hoursOf(extratags),
    });
    if (out.length === MAX_PLACES) break;
  }
  return out;
}

/** A place's `opening_hours` tag, on one line, or null when it has none */
function hoursOf(tags: unknown): string | null {
  if (typeof tags !== "object" || tags === null) return null;
  const v = (tags as Record<string, unknown>).opening_hours;
  if (typeof v !== "string") return null;
  const line = v.replace(/\s+/g, " ").trim();
  return line === "" ? null : line.slice(0, HOURS);
}

/**
 * What is at a point: the place there (a shop, a sight) or, short of one, the street; null
 * inside when OpenStreetMap has nothing there, null outside when it could not be asked
 */
export async function reverseGeocode(
  env: Env,
  at: { lat: number; lng: number },
  lang: "ja" | "en",
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
    res = await fetch(`${env.GEOCODER_BASE_URL ?? NOMINATIM}/reverse?${params}`, {
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

/**
 * Nominatim's reverse answer as the place at `at`: its own name when it has one (a shop, a
 * sight), else the most telling part of its address (a building, then the street); the point
 * stays the one pinned. Null when there is nothing there (the sea: `{ "error": … }`).
 */
export function placeAt(raw: unknown, at: { lat: number; lng: number }): Place | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const line = typeof r.display_name === "string" ? r.display_name : null;
  if (line === null) return null;
  const address =
    typeof r.address === "object" && r.address !== null
      ? (r.address as Record<string, unknown>)
      : {};
  const own = typeof r.name === "string" ? r.name.trim() : "";
  const part = NAMED.map((k) => address[k]).find(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
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
    hours: hoursOf(r.extratags),
  };
}
