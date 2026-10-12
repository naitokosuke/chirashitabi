import type { Pinned } from "./pin";
import type { LatLng } from "./types";

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

export const googleMapsLink = ({ lat, lng }: LatLng) =>
  `https://www.google.com/maps?q=${lat},${lng}`;
/**
 * A found place as a Google Maps link: a search for its name at its point, so Google opens
 * on the place itself, and the point reads back out of the link (parseMapsUrl) as the pin
 */
export const placeSearchLink = (name: string, { lat, lng }: LatLng) =>
  // fixed decimals: a whole-degree point still reads back (parseMapsUrl wants a decimal point)
  `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat.toFixed(6)},${lng.toFixed(6)},17z`;

/**
 * A pasted link, or undefined unless it is http(s). Notes come from the other
 * person in the room, so a `javascript:` URL must never reach an href.
 */
export function safeUrl(url: string | null): string | undefined {
  if (url === null || !URL.canParse(url)) return undefined;
  const u = new URL(url);
  return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
}

/**
 * What a pasted link sets on a note: the link itself (blank clears it), and
 * the pin when it can be read from it. Unreadable links keep the current pin.
 */
export function placeFromUrl(
  raw: string,
  pin: LatLng | null,
): { mapsUrl: string | null; pin: LatLng | null } {
  const trimmed = raw.trim();
  const mapsUrl = trimmed === "" ? null : trimmed;
  return { mapsUrl, pin: (mapsUrl === null ? null : parseMapsUrl(mapsUrl)) ?? pin };
}

/** Where "Open in Google Maps" goes: the pasted link, else the pin */
export const placeLink = (n: Pinned) => n.mapsUrl ?? googleMapsLink(n.pin);
