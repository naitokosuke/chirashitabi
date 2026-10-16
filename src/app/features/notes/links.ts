import type { HttpUrl } from "../place/google-maps";

/** The site a page is on, as it reads on a card: its host without `www.`; "" for no link */
export const siteOf = (url: HttpUrl | null): string =>
  url === null || !URL.canParse(url) ? "" : new URL(url).hostname.replace(/^www\./, "");
