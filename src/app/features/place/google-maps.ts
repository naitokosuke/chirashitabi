/** Pull lat/lng out of a (long) Google Maps URL. Short maps.app.goo.gl links need the Worker to expand them first. */
export function parseMapsUrl(url: string): { lat: number; lng: number } | null {
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
export const googleMapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

/**
 * A pasted link, or undefined unless it is http(s). Notes come from the other
 * person in the room, so a `javascript:` URL must never reach an href.
 */
export function safeUrl(url: string | undefined): string | undefined {
  if (!url || !URL.canParse(url)) return undefined;
  const u = new URL(url);
  return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
}

/**
 * What a pasted link sets on a note: the link itself (blank clears it), and
 * the coordinates when they can be read from it. Unreadable links keep the pin.
 */
export function placeFromUrl(raw: string): { mapsUrl?: string; lat?: number; lng?: number } {
  const mapsUrl = raw.trim() || undefined;
  const c = mapsUrl ? parseMapsUrl(mapsUrl) : null;
  return c ? { mapsUrl, ...c } : { mapsUrl };
}

/** Where "Open in Google Maps" goes: the pasted link, else the pin */
export const placeLink = (p: { mapsUrl?: string; lat: number; lng: number }) =>
  p.mapsUrl || googleMapsLink(p.lat, p.lng);
