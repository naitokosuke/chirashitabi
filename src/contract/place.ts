/** A point on the map. Always both halves: a latitude alone is not a place */
export interface LatLng {
  lat: number;
  lng: number;
}

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
    if (lat !== undefined && lng !== undefined) return { lat: +lat, lng: +lng };
  }
  return null;
}
/**
 * A short link Google Maps hands out to share a place (`maps.app.goo.gl/…`): its point is behind
 * a redirect only the Worker can follow (docs/auth-and-security.md, "Expanding short links")
 */
export function isShortMapsLink(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.hostname === "maps.app.goo.gl" || u.hostname === "g.co") return true;
  return (u.hostname === "app.goo.gl" || u.hostname === "goo.gl") && u.pathname.startsWith("/maps");
}
