/** Pull lat/lng out of a (long) Google Maps URL. Short maps.app.goo.gl links need the Worker to expand them first. */
export function parseMapsUrl(url: string): { lat: number; lng: number } | null {
  const pats = [/@(-?\d+\.\d+),(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/]
  for (const p of pats) { const m = url.match(p); if (m) return { lat: +m[1], lng: +m[2] } }
  return null
}
export const googleMapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
