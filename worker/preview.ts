import * as v from "valibot";

import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "./wire";

/**
 * What a page says of itself (Open Graph: its title, a line and a picture), for a note that
 * carries a link to it; YouTube through its oEmbed, which needs no key. The Worker fetches the
 * page, since a browser cannot read another site's HTML, so the fetch is fenced
 * (docs/auth-and-security.md, "Previewing links"): a public http(s) address, never one of our
 * hosts, at most three redirects, a page of HTML read to PAGE_BYTES, a picture of a kind the
 * room keeps and no larger than one it keeps, each with a timeout. Anything else is no preview.
 */

export interface Preview {
  /** Where it ended, after redirects */
  url: string;
  /** The site, as its host reads without `www.` */
  site: string;
  title: string | null;
  description: string | null;
  /** Its picture's bytes and type, when it has one the room keeps */
  image: { bytes: Uint8Array; type: string } | null;
}

/** How much of a page is read for its head */
export const PAGE_BYTES = 512 * 1024;
const REDIRECTS = 3;
const TIMEOUT_MS = 8000;
const TITLE = 200;
const DESCRIPTION = 1000;
/** A desktop browser's: a page answers one with its markup, not a login or an app's shell */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** An address a preview may be fetched from: http(s), a named host, and none of `ours` */
export function previewable(url: string, ours: string[]): URL | null {
  if (!URL.canParse(url)) return null;
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname;
  // an address by number, or no dot (a machine on some network): not a page on the web
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (ours.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  u.hash = "";
  return u;
}

const YOUTUBE = /^(?:www\.|m\.)?youtube\.com$|^youtu\.be$/;

/** A YouTube page's video, named as its oEmbed wants the page */
const isYouTube = (u: URL) => YOUTUBE.test(u.hostname);

/** A video's id as YouTube writes one: its URL-safe letters, 6 to 20 of them */
const VideoIdSchema = v.pipe(v.string(), v.nanoid(), v.minLength(6), v.maxLength(20));

/**
 * A video's one address, whatever form it was shared in (youtu.be/<id>, /watch?v=<id>,
 * /shorts/<id>, /live/<id>); the address as given when it names no video
 */
export function youtubeWatch(u: URL): string {
  const id =
    u.hostname === "youtu.be"
      ? u.pathname.slice(1).split("/")[0]
      : (u.searchParams.get("v") ?? /^\/(?:shorts|live|embed)\/([^/]+)/.exec(u.pathname)?.[1]);
  return v.is(VideoIdSchema, id) ? `https://www.youtube.com/watch?v=${id}` : u.href;
}

/** The site a page is on, as it reads: its host without `www.` */
export const siteOf = (u: URL) => u.hostname.replace(/^www\./, "");

/** HTML's entities back into characters: the named ones a page's head uses, and the numbered */
export function decodeEntities(s: string): string {
  const NAMED: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

/** One line of words, trimmed and cut */
const line = (s: string | undefined, max: number) => {
  const t = s === undefined ? "" : decodeEntities(s).replace(/\s+/g, " ").trim();
  return t === "" ? null : t.slice(0, max);
};

/** A tag's attributes, however they are quoted; names lowercased */
function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, dq, sq, bare] of tag.matchAll(
    /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
  ))
    if (name !== undefined) out.set(name.toLowerCase(), dq ?? sq ?? bare ?? "");
  return out;
}

/** What a page's head says: Open Graph first, the plain tags where it says nothing */
export function readHead(html: string): {
  title: string | null;
  description: string | null;
  image: string | null;
} {
  const head = html.slice(0, PAGE_BYTES);
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.get("property") ?? a.get("name"))?.toLowerCase();
    const content = a.get("content");
    if (key !== undefined && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title\b[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];
  return {
    title: line(meta.get("og:title") ?? meta.get("twitter:title") ?? titleTag, TITLE),
    description: line(
      meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"),
      DESCRIPTION,
    ),
    image: line(
      meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image"),
      2000,
    ),
  };
}

/** One step of reading a body: done, or a chunk of bytes */
const StepSchema = v.object({ done: v.boolean(), value: v.optional(v.instance(Uint8Array)) });

/** Reads a response's body up to `max` bytes and no further */
async function readUpTo(res: Response, max: number): Promise<Uint8Array | null> {
  const length = Number(res.headers.get("Content-Length") ?? "0");
  if (length > max) return null;
  const reader = res.body?.getReader();
  if (reader === undefined) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const step = v.safeParse(StepSchema, await reader.read());
    if (!step.success) {
      await reader.cancel();
      return null;
    }
    const { done, value } = step.output;
    if (done || value === undefined) break;
    chunks.push(value);
    got += value.byteLength;
    if (got > max) {
      await reader.cancel();
      return null;
    }
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Where a fetch goes: the address itself, or, in the tests, the stub at `base` with the
 * address's host in a header, so no test reaches the web
 */
function target(
  u: URL,
  base: string | undefined,
): { url: string; headers: Record<string, string> } {
  if (base === undefined) return { url: u.href, headers: {} };
  return { url: `${base}${u.pathname}${u.search}`, headers: { "X-Preview-Host": u.hostname } };
}

/** A GET with a timeout, following at most REDIRECTS redirects, each held to `previewable` */
async function get(
  u: URL,
  accept: string,
  ours: string[],
  base?: string,
): Promise<Response | null> {
  let at: URL | null = u;
  for (let hop = 0; hop <= REDIRECTS && at !== null; hop++) {
    const t = target(at, base);
    let res: Response;
    try {
      res = await fetch(t.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: accept, ...t.headers },
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("Location");
      at = location === null ? null : previewable(new URL(location, at).href, ours);
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

/** A response's media type, without its parameters, lowercased */
const mediaType = (res: Response) =>
  (res.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

/** The page's picture, when it is one the room keeps and no larger than one it keeps */
async function picture(src: string, ours: string[], base?: string): Promise<Preview["image"]> {
  const u = previewable(src, ours);
  if (u === null) return null;
  const res = await get(u, "image/webp,image/jpeg,image/png", ours, base);
  if (res === null) return null;
  const type = mediaType(res);
  if (!IMAGE_TYPES.some((t) => t === type)) return null;
  const bytes = await readUpTo(res, MAX_IMAGE_BYTES);
  return bytes === null || bytes.byteLength === 0 ? null : { bytes, type };
}

/** What YouTube's oEmbed says of a video; a field that is not there, or not words, is none */
const OEmbedSchema = v.object({
  title: v.fallback(v.nullable(v.string()), null),
  author_name: v.fallback(v.nullable(v.string()), null),
  thumbnail_url: v.fallback(v.nullable(v.string()), null),
});

/** YouTube's oEmbed: the video's title, its channel, and a thumbnail; no key */
async function youtube(u: URL, ours: string[], base?: string): Promise<Preview | null> {
  const api = new URL("https://www.youtube.com/oembed");
  api.searchParams.set("url", u.href);
  api.searchParams.set("format", "json");
  const res = await get(api, "application/json", ours, base);
  if (res === null) return null;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const o = v.safeParse(OEmbedSchema, body);
  if (!o.success) return null;
  const { title, author_name: author, thumbnail_url: thumb } = o.output;
  return {
    url: youtubeWatch(u),
    site: "youtube.com",
    title: title === null ? null : line(title, TITLE),
    description: author === null ? null : line(author, TITLE),
    image: thumb === null ? null : await thumbnail(thumb, ours, base),
  };
}

/**
 * A video's picture without the black bars: oEmbed names `hqdefault.jpg` (4:3, a 16:9 video
 * letterboxed in it), so the largest 16:9 one is tried first (`maxresdefault`, not every video
 * has it), then the small 16:9 one every video has (`mqdefault`), then what oEmbed named
 */
async function thumbnail(named: string, ours: string[], base?: string): Promise<Preview["image"]> {
  const m = /^(https:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/)[a-z]+\.(jpg|webp)$/.exec(named);
  if (m !== null) {
    for (const size of ["maxresdefault", "mqdefault"]) {
      const found = await picture(`${m[1]}${size}.${m[2]}`, ours, base);
      if (found !== null) return found;
    }
  }
  return picture(named, ours, base);
}

/**
 * The preview of the page at `url`, or null when there is none to be had; `ours` are the hosts
 * never fetched (the app's and the booklet's), `base` the tests' stub
 */
export async function preview(url: string, ours: string[], base?: string): Promise<Preview | null> {
  const u = previewable(url, ours);
  if (u === null) return null;
  if (isYouTube(u)) return youtube(u, ours, base);
  const res = await get(u, "text/html", ours, base);
  if (res === null) return null;
  const type = mediaType(res);
  if (type !== "text/html" && type !== "application/xhtml+xml") return null;
  const bytes = await readUpTo(res, PAGE_BYTES);
  if (bytes === null) return null;
  const head = readHead(new TextDecoder().decode(bytes));
  // where the page ended: the stub keeps the address asked for, the web may have moved it
  const ended = base === undefined && res.url !== "" ? (previewable(res.url, ours) ?? u) : u;
  return {
    url: ended.href,
    site: siteOf(ended),
    title: head.title,
    description: head.description,
    image: head.image === null ? null : await picture(new URL(head.image, ended).href, ours, base),
  };
}
