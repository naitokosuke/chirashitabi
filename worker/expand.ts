import { isShortMapsLink } from "../src/contract/place";

/**
 * A short Google Maps link, expanded: the one redirect it answers with is read, never followed,
 * and kept only when it goes to Google Maps itself (docs/auth-and-security.md, "Expanding short
 * links"). The page behind it is never fetched.
 */

/** Google's own hosts: `google.<tld>` or `google.<cc>.<tld>`, bare or under `www.` / `maps.` */
const GOOGLE = /^(?:www\.|maps\.)?google\.(?:[a-z]{2,3}|(?:com?|co)\.[a-z]{2})$/;

/** A desktop browser's: the short-link host answers one with the redirect, not an app page */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/**
 * Where a redirect's `Location` goes, when it is Google Maps: as it is, or the link a Google
 * Maps Go wrapper (`maps.app.goo.gl/?link=<url>`) carries, held to the same rule; else null
 */
export function acceptedLocation(location: string | null): string | null {
  if (location === null || !URL.canParse(location)) return null;
  const u = new URL(location);
  if (u.protocol !== "https:") return null;
  if (u.hostname === "maps.app.goo.gl") return acceptedLocation(u.searchParams.get("link"));
  return GOOGLE.test(u.hostname) ? u.href : null;
}

/**
 * The name a Google Maps link is about, when it names a place rather than a point: its `q`
 * (`?q=Hotel+Proverbs&ftid=…`, a phone's share), else the place in its path
 * (`/maps/place/Hotel+Proverbs/data=…`, what a short link most often leads to)
 */
export function placeName(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const u = new URL(url);
  const q = u.searchParams.get("q")?.trim() ?? "";
  if (q !== "") return q.slice(0, 200);
  const [, segment] = /\/maps\/(?:place|search)\/([^/]+)/.exec(u.pathname) ?? [];
  if (segment === undefined) return null;
  let name: string;
  try {
    name = decodeURIComponent(segment.replace(/\+/g, " ")).trim();
  } catch {
    return null;
  }
  // a search for a point is not a name (parseMapsUrl reads that one)
  return name === "" || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name) ? null : name.slice(0, 200);
}

/**
 * The link a short one stands for, or null when it is not a short one or did not say; `base`
 * replaces the short link's origin in the tests
 */
export async function expand(url: string, base?: string): Promise<string | null> {
  if (!isShortMapsLink(url)) return null;
  const u = new URL(url);
  const target = base === undefined ? u.href : `${base}${u.pathname}${u.search}`;
  let res: Response;
  try {
    res = await fetch(target, { redirect: "manual", headers: { "User-Agent": USER_AGENT } });
  } catch {
    return null;
  }
  if (res.status >= 300 && res.status < 400) return acceptedLocation(res.headers.get("Location"));
  // a runtime that followed the redirect anyway (wrangler's test harness does) ended on it: the
  // same rule holds for where it ended
  return res.redirected ? acceptedLocation(res.url) : null;
}
