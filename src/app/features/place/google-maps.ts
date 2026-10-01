import type { Pinned } from "./pin";
import type { LatLng } from "./types";

/** Pull lat/lng out of a (long) Google Maps URL. Short maps.app.goo.gl links need the Worker to expand them first. */
export function parseMapsUrl(url: string): LatLng | null {
  const pats = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const p of pats) {
    const m = url.match(p);
    if (m) return { lat: +m[1], lng: +m[2] };
  }
  return null;
}
export const googleMapsLink = ({ lat, lng }: LatLng) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

/**
 * A pasted link, or undefined unless it is http(s). Notes come from the other
 * person in the room, so a `javascript:` URL must never reach an href.
 */
export function safeUrl(url: string | null): string | undefined {
  if (!url || !URL.canParse(url)) return undefined;
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
  const mapsUrl = raw.trim() || null;
  return { mapsUrl, pin: (mapsUrl && parseMapsUrl(mapsUrl)) || pin };
}

/** Where "Open in Google Maps" goes: the pasted link, else the pin */
export const placeLink = (n: Pinned) => n.mapsUrl || googleMapsLink(n.pin);
