import * as v from "valibot";

/**
 * A link as written that is http(s), at most 2000 characters: what a note or a stay may carry.
 * Notes come from the other person in the room, so a `javascript:` URL never reaches an href.
 */
export const HttpUrlSchema = v.pipe(
  v.string(),
  v.maxLength(2000),
  v.url(),
  // a failed `url` does not stop the pipe, so this reads what may be no URL
  v.check((s) => ["https:", "http:"].includes(URL.parse(s)?.protocol ?? "")),
  v.brand("HttpUrl"),
);

export type HttpUrl = v.InferOutput<typeof HttpUrlSchema>;

/** The link as written, or null when it is not one a note may carry */
export const httpUrl = (value: unknown): HttpUrl | null => {
  const result = v.safeParse(HttpUrlSchema, value);
  return result.success ? result.output : null;
};

/** A point on the map, as a member may send one: both halves, and nothing else */
export const LatLngSchema = v.strictObject({
  lat: v.pipe(v.number(), v.finite(), v.minValue(-90), v.maxValue(90)),
  lng: v.pipe(v.number(), v.finite(), v.minValue(-180), v.maxValue(180)),
});

/** A point on the map. Always both halves: a latitude alone is not a place */
export type LatLng = v.InferOutput<typeof LatLngSchema>;

/** Pull lat/lng out of a (long) Google Maps URL. Short maps.app.goo.gl links need the Worker to expand them first. */
export function parseMapsUrl(url: string): LatLng | null {
  const pats = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    // where a shared short link leads: /maps/search/25.0416,+121.5489
    /\/search\/(-?\d+\.\d+),(?:\+|%20)?(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const p of pats) {
    const [, lat, lng] = url.match(p) ?? [];
    // a pattern reads any number; only one on the map is a point
    const at = v.safeParse(LatLngSchema, { lat: Number(lat), lng: Number(lng) });
    if (at.success) return at.output;
  }
  return null;
}
/**
 * A short link Google Maps hands out to share a place (`maps.app.goo.gl/…`): its point is behind
 * a redirect only the Worker can follow (docs/auth-and-security.md, "Expanding short links")
 */
export function isShortMapsLink(url: string): boolean {
  const u = URL.parse(url);
  if (u === null || (u.protocol !== "https:" && u.protocol !== "http:")) return false;
  if (u.hostname === "maps.app.goo.gl" || u.hostname === "g.co") return true;
  return (u.hostname === "app.goo.gl" || u.hostname === "goo.gl") && u.pathname.startsWith("/maps");
}
