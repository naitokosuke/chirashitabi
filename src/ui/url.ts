/**
 * An address as an href may take it: a web page (http, https) or a path on this site; undefined
 * for anything else. Links in notes come from the other person in the room, so a `javascript:`
 * URL must never reach an href.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (url === null || url === undefined) return undefined;
  // `//host` and `/\host` leave for another host, as browsers read them
  if (url.startsWith("/")) return url[1] === "/" || url[1] === "\\" ? undefined : url;
  if (!URL.canParse(url)) return undefined;
  const u = new URL(url);
  return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
}
