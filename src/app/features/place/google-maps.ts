import * as v from "valibot";

import {
  parseHttpUrl,
  HttpUrlSchema,
  isShortMapsLink,
  parseMapsUrl,
  type HttpUrl,
} from "../../../contract/place";

import type { Pinned } from "./pin";
import type { LatLng } from "./types";

// a link a note may carry, and reading its point, as the app takes them from the contract
export {
  parseHttpUrl,
  HttpUrlSchema,
  isShortMapsLink,
  parseMapsUrl,
  type HttpUrl,
} from "../../../contract/place";

/**
 * A link Google hands out, short or long, with a point in it or not: the place's, not a page
 * to read
 */
export const isMapsLink = (url: HttpUrl) =>
  isShortMapsLink(url) ||
  parseMapsUrl(url) !== null ||
  /(^|\.)google\.[a-z.]+$/.test(new URL(url).hostname);

export const googleMapsLink = ({ lat, lng }: LatLng): HttpUrl =>
  v.parse(HttpUrlSchema, `https://www.google.com/maps?q=${lat},${lng}`);
/**
 * A found place as a Google Maps link: a search for its name at its point, so Google opens
 * on the place itself, and the point reads back out of the link (parseMapsUrl) as the pin
 */
export const placeSearchLink = (name: string, { lat, lng }: LatLng): HttpUrl =>
  // fixed decimals: a whole-degree point still reads back (parseMapsUrl wants a decimal point)
  v.parse(
    HttpUrlSchema,
    `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat.toFixed(6)},${lng.toFixed(6)},17z`,
  );

/**
 * Google Maps' directions between two points (its Maps URLs, no key): on foot for a walk, else
 * by public transport, which Google times with the real lines
 */
export const directionsLink = (from: LatLng, to: LatLng, walk: boolean): HttpUrl =>
  v.parse(
    HttpUrlSchema,
    // the comma between the coordinates written %2C, as the Maps URLs documentation asks
    `https://www.google.com/maps/dir/?api=1&origin=${from.lat}%2C${from.lng}&destination=${to.lat}%2C${to.lng}&travelmode=${walk ? "walking" : "transit"}`,
  );

/**
 * What a pasted link sets on a note: the link itself (blank clears it), and the pin when it can
 * be read from it. Unreadable links keep the current pin; what is not a link a note may carry
 * sets none, as the room would refuse it.
 */
export function placeFromUrl(
  raw: string,
  pin: LatLng | null,
): { mapsUrl: HttpUrl | null; pin: LatLng | null } {
  const mapsUrl = parseHttpUrl(raw.trim());
  return { mapsUrl, pin: (mapsUrl === null ? null : parseMapsUrl(mapsUrl)) ?? pin };
}

/** Where "Open in Google Maps" goes: the pasted link, else the pin */
export const placeLink = (n: Pinned) => n.mapsUrl ?? googleMapsLink(n.pin);
