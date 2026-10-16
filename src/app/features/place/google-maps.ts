import { httpUrl, parseMapsUrl, type HttpUrl } from "../../../contract/place";

import type { Pinned } from "./pin";
import type { LatLng } from "./types";

// a link a note may carry, and reading its point, as the app takes them from the contract
export { httpUrl, isShortMapsLink, parseMapsUrl, type HttpUrl } from "../../../contract/place";

export const googleMapsLink = ({ lat, lng }: LatLng): HttpUrl =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here: an https link
  `https://www.google.com/maps?q=${lat},${lng}` as HttpUrl;
/**
 * A found place as a Google Maps link: a search for its name at its point, so Google opens
 * on the place itself, and the point reads back out of the link (parseMapsUrl) as the pin
 */
export const placeSearchLink = (name: string, { lat, lng }: LatLng): HttpUrl =>
  // fixed decimals: a whole-degree point still reads back (parseMapsUrl wants a decimal point)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here: an https link
  `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat.toFixed(6)},${lng.toFixed(6)},17z` as HttpUrl;

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
 * What a pasted link sets on a note: the link itself (blank clears it), and the pin when it can
 * be read from it. Unreadable links keep the current pin; what is not a link a note may carry
 * sets none, as the room would refuse it.
 */
export function placeFromUrl(
  raw: string,
  pin: LatLng | null,
): { mapsUrl: HttpUrl | null; pin: LatLng | null } {
  const mapsUrl = httpUrl(raw.trim());
  return { mapsUrl, pin: (mapsUrl === null ? null : parseMapsUrl(mapsUrl)) ?? pin };
}

/** Where "Open in Google Maps" goes: the pasted link, else the pin */
export const placeLink = (n: Pinned) => n.mapsUrl ?? googleMapsLink(n.pin);
