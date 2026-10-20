import type { Lang, NoteColor, WireMemo, WireNote, WireTrip } from "./wire";

/**
 * The booklet as a public page (docs/auth-and-security.md): one static HTML file the Worker
 * writes from the room's own data when its owner publishes, so nothing a browser sends ends up
 * on the public host. It has the plan and nothing private: the trip's name and days, each day's
 * line, its flights and where its night is spent, and the confirmed notes with their times,
 * words and places. No budget, no booking number or page, no picture, no member.
 *
 * Every word the travellers wrote is escaped; a link is only ever an http(s) one; nothing is
 * written into a `style` attribute (a note's paper is a class); the page has no script, and the
 * host serves it with a CSP that allows none.
 */

const WORDS = {
  ja: {
    title: (trip: string) => `${trip} のしおり`,
    day: (n: number) => `${n}日目`,
    anytime: "いつでも",
    map: "地図",
    tonight: "今夜の宿",
    out: "行き",
    back: "帰り",
    empty: "まだ予定はありません",
    footer: (at: string) => `chirashitabi で作ったしおり · ${at} 時点`,
  },
  en: {
    title: (trip: string) => `${trip}: the booklet`,
    day: (n: number) => `Day ${n}`,
    anytime: "Anytime",
    map: "Map",
    tonight: "Tonight",
    out: "There",
    back: "Home",
    empty: "Nothing planned yet",
    footer: (at: string) => `A booklet made with chirashitabi · as of ${at}`,
  },
} as const;

/** Text as HTML, in an element or an attribute */
export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** A link the page may carry: http(s) only, escaped; null for anything else */
function safeLink(url: string | null): string | null {
  if (url === null || !URL.canParse(url)) return null;
  const u = new URL(url);
  return u.protocol === "https:" || u.protocol === "http:" ? escapeHtml(u.href) : null;
}

/** A note's place as a link: its own, else Google Maps at its pin */
function placeLink(n: WireMemo): string | null {
  if (n.mapsUrl !== null) return safeLink(n.mapsUrl);
  return n.pin === null
    ? null
    : safeLink(`https://www.google.com/maps?q=${n.pin.lat},${n.pin.lng}`);
}

/** The paper colors a note may be, as the class its card takes; a new color fails to compile until it has one */
const PAPER = {
  "#fff1b8": "yellow",
  "#ffd9de": "pink",
  "#d8f0e6": "mint",
  "#dbe7ff": "sky",
  "#ead9ff": "lilac",
  "#ffffff": "white",
} satisfies Record<NoteColor, string>;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const dateText = (date: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

type Scheduled = WireMemo & { schedule: NonNullable<WireMemo["schedule"]> };
const isConfirmed = (n: WireNote): n is Scheduled =>
  n.kind === "memo" && n.schedule !== null && n.schedule.status !== "idea";

/** A day's confirmed notes, timed ones by their time and the rest after, as the booklet orders them */
function dayNotes(notes: WireNote[], date: string): Scheduled[] {
  return notes
    .filter(isConfirmed)
    .filter((n) => n.schedule.date === date)
    .sort((a, b) => {
      const [ta, tb] = [a.schedule.time, b.schedule.time];
      if (ta === null || tb === null) return Number(ta === null) - Number(tb === null);
      return minutesOf(ta) - minutesOf(tb);
    });
}

function noteHtml(n: Scheduled, lang: Lang): string {
  const t = n.schedule.time;
  const when =
    t === null
      ? WORDS[lang].anytime
      : n.minutes === null
        ? t.slice(0, 5)
        : `${t.slice(0, 5)}–${clock(minutesOf(t) + n.minutes)}`;
  const link = placeLink(n);
  return [
    `<li class="note ${PAPER[n.color]}"${n.schedule.status === "done" ? " data-done" : ""}>`,
    `<p class="time">${escapeHtml(when)}</p>`,
    "<div>",
    `<h3>${escapeHtml(n.title)}</h3>`,
    n.body === "" ? "" : `<p class="body">${escapeHtml(n.body)}</p>`,
    link === null
      ? ""
      : `<p><a href="${link}" rel="noopener noreferrer" target="_blank">${WORDS[lang].map}</a></p>`,
    "</div>",
    "</li>",
  ].join("");
}

/** When a flight leaves or lands, as its ticket says it */
const ticketTime = (t: string | null) => (t === null ? "" : ` ${t.slice(11, 16)}`);

function dayHtml(trip: WireTrip, notes: WireNote[], i: number, lang: Lang): string {
  const day = trip.days[i];
  if (day === undefined) return "";
  const w = WORDS[lang];
  const flights = (["out", "back"] as const).flatMap((leg) => {
    const f = trip.flights[leg];
    if (f === null) return [];
    // on the day it leaves or lands, as its times say; with none, the first or the last day
    const on = [f.departs, f.arrives].flatMap((t) => (t === null ? [] : [t.slice(0, 10)]));
    const taken =
      on.length > 0 ? on : [leg === "out" ? trip.days[0]?.date : trip.days.at(-1)?.date];
    if (!taken.includes(day.date)) return [];
    const number = f.number === "" ? "" : `${escapeHtml(f.number)} `;
    return [
      `<p class="line"><b>${w[leg]}</b> ${number}${escapeHtml(f.from)}${ticketTime(f.departs)} → ${escapeHtml(f.to)}${ticketTime(f.arrives)}</p>`,
    ];
  });
  const stay = trip.stays.find((s) => {
    const first = Date.parse(`${s.checkIn}T00:00:00Z`);
    const d = Date.parse(`${day.date}T00:00:00Z`);
    return first <= d && d < first + s.nights * 86_400_000;
  });
  const stayLink = stay === undefined ? null : safeLink(stay.mapsUrl);
  const items = dayNotes(notes, day.date);
  return [
    "<section>",
    `<h2>${w.day(i + 1)} <small>${escapeHtml(dateText(day.date, lang))}</small></h2>`,
    ...flights,
    stay === undefined
      ? ""
      : `<p class="line"><b>${w.tonight}</b> ${
          stayLink === null
            ? escapeHtml(stay.name)
            : `<a href="${stayLink}" rel="noopener noreferrer" target="_blank">${escapeHtml(stay.name)}</a>`
        }</p>`,
    day.intro === "" ? "" : `<p class="intro">${escapeHtml(day.intro)}</p>`,
    items.length === 0
      ? `<p class="empty">${w.empty}</p>`
      : `<ol>${items.map((n) => noteHtml(n, lang)).join("")}</ol>`,
    "</section>",
  ].join("");
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--ink:#24262b;--muted:#5f636b;--line:#e2e4e8;--danger:#c0392b;
--yellow:#fbf1c4;--pink:#f9dfe2;--mint:#dcf0e6;--sky:#dee8fb;--lilac:#ebe0fb;--white:#fdfdfd;--paper-ink:#24262b}
@media (prefers-color-scheme:dark){:root{--bg:#1c1d20;--ink:#ecedf0;--muted:#a9adb5;--line:#3a3c41}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI",Meiryo,system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:28px 16px 48px}
h1{margin:0;font-size:28px;line-height:1.2;overflow-wrap:anywhere}
header p{margin:6px 0 0;color:var(--muted);font-weight:700}
section{margin-top:32px}
h2{margin:0 0 10px;font-size:20px}
h2 small{color:var(--muted);font-size:15px}
.line{margin:4px 0;font-size:14px}
.line b{color:var(--muted);margin-right:6px}
.intro{margin:10px 0;white-space:pre-wrap}
.empty{color:var(--muted);font-size:14px}
ol{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.note{display:flex;border-radius:6px;color:var(--paper-ink);box-shadow:0 1px 2px rgb(0 0 0/.12)}
.note .time{flex-shrink:0;width:96px;margin:0;padding:10px 6px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums;background:rgb(0 0 0/.05);border-radius:6px 0 0 6px}
.note div{flex:1;min-width:0;padding:10px 12px}
.note h3{margin:0;font-size:16px;overflow-wrap:anywhere}
.note p{margin:4px 0 0;font-size:14px}
.note .body{white-space:pre-wrap;color:#55585f}
.note[data-done] h3{color:#55585f}
a{color:inherit;font-weight:700;text-underline-offset:3px}
.yellow{background:var(--yellow)}.pink{background:var(--pink)}.mint{background:var(--mint)}
.sky{background:var(--sky)}.lilac{background:var(--lilac)}.white{background:var(--white)}
footer{margin-top:40px;color:var(--muted);font-size:12px;text-align:center}
`;

/** The page, as of `at` (an ISO instant), in `lang` */
export function renderBooklet(trip: WireTrip, notes: WireNote[], lang: Lang, at: string): string {
  const w = WORDS[lang];
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  const range =
    first === undefined || last === undefined
      ? ""
      : first === last
        ? dateText(first, lang)
        : `${dateText(first, lang)} – ${dateText(last, lang)}`;
  const asOf = new Intl.DateTimeFormat(lang, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(at));
  return [
    "<!doctype html>",
    `<html lang="${lang}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="referrer" content="no-referrer">',
    `<title>${escapeHtml(w.title(trip.name))}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    "<body>",
    "<main>",
    `<header><h1>${escapeHtml(trip.name)}</h1>${range === "" ? "" : `<p>${escapeHtml(range)}</p>`}</header>`,
    ...trip.days.map((_, i) => dayHtml(trip, notes, i, lang)),
    `<footer>${escapeHtml(w.footer(asOf))}</footer>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}
