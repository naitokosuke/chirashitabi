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
}

/** The places a query finds, best first; null when the geocoder could not be asked */
export async function geocode(env: Env, query: string, lang: "ja" | "en"): Promise<Place[] | null> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: String(MAX_PLACES),
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
    const { name, display_name: line, lat, lon } = r as Record<string, unknown>;
    const la = Number(lat);
    const ln = Number(lon);
    if (typeof line !== "string" || !Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) continue;
    const parts = line.split(",").map((p) => p.trim());
    const title = typeof name === "string" && name.trim() !== "" ? name.trim() : (parts[0] ?? "");
    if (title === "") continue;
    // the address is the line without the name it starts with
    const address = (parts[0] === title ? parts.slice(1) : parts).join(", ");
    out.push({ name: title.slice(0, 120), address: address.slice(0, 240), lat: la, lng: ln });
    if (out.length === MAX_PLACES) break;
  }
  return out;
}
