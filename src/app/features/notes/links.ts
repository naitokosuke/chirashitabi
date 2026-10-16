import type { HttpUrl } from "../place/google-maps";

/** The site a page is on, as it reads on a card: its host without `www.`; "" for no link */
export const siteOf = (url: HttpUrl | null): string =>
  url === null || !URL.canParse(url) ? "" : new URL(url).hostname.replace(/^www\./, "");

/** A note's words cut at the links in them, so each link can be tapped and the rest read as it is */
export type Segment = { kind: "text"; text: string } | { kind: "link"; url: string };

/** http(s) addresses as people paste them, up to the space or the bracket that ends them */
const LINK = /https?:\/\/[^\s<>"'）」』]+/g;

export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK)) {
    // a sentence's full stop or comma after the address is the sentence's
    const url = m[0].replace(/[.,;:!?。、]+$/, "");
    if (!URL.canParse(url)) continue;
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    out.push({ kind: "link", url });
    at = m.index + url.length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}
