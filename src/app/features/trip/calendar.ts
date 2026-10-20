import { Temporal } from "temporal-polyfill-lite";

import type { Note, Scheduled } from "../notes/types";
import type { RoomId } from "../rooms/types";

import { checkOut, flightDays } from "./itinerary";
import type { Leg, TripSnapshot } from "./types";

/**
 * The trip as an iCalendar file (RFC 5545), for a phone's or a computer's own calendar: each
 * confirmed (or done) note on its day, each flight and each stay. Times are written as they are
 * kept, in the place's own clock, with no time zone ("floating"), so a calendar shows 12:30 as
 * 12:30 wherever the phone is. A maybe stays in the booklet.
 */

/** What the file's words say beside the travellers' own, in their language */
export interface CalendarWords {
  /** A flight's summary: "BR 191 HND → TSA" */
  flight: (number: string, from: string, to: string) => string;
  /** A stay's summary */
  stay: (name: string) => string;
  /** A note's booking line, "Booked · ABC123" */
  booked: (code: string) => string;
}

const CRLF = "\r\n";
const encoder = new TextEncoder();

/** Text as a property value: backslashes, semicolons, commas and line breaks escaped */
const text = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** A content line folded to at most 75 octets a line, never inside a character */
export function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // the first line has 75 octets; each one after, its leading space and 74
    if (octets + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const day = (d: Temporal.PlainDate) => `${pad(d.year, 4)}${pad(d.month)}${pad(d.day)}`;
const time = (t: Temporal.PlainDateTime) =>
  `${day(t.toPlainDate())}T${pad(t.hour)}${pad(t.minute)}${pad(t.second)}`;
const stamp = (i: Temporal.Instant) => {
  const t = i.toZonedDateTimeISO("UTC").toPlainDateTime();
  return `${time(t)}Z`;
};

type Event = { uid: string; lines: string[] };

/** All day from `first` to the day before `end` (DTEND is exclusive for dates) */
const allDay = (first: Temporal.PlainDate, end: Temporal.PlainDate) => [
  `DTSTART;VALUE=DATE:${day(first)}`,
  `DTEND;VALUE=DATE:${day(end)}`,
];

function noteEvent(n: Scheduled, words: CalendarWords): Event {
  const t = n.schedule.time;
  const when =
    t === null
      ? allDay(n.schedule.date, n.schedule.date.add({ days: 1 }))
      : [
          `DTSTART:${time(n.schedule.date.toPlainDateTime(t))}`,
          ...(n.minutes === null ? [] : [`DURATION:PT${n.minutes}M`]),
        ];
  const booked =
    n.booking?.state === "booked" && n.booking.code !== "" ? [words.booked(n.booking.code)] : [];
  const description = [n.body, ...booked].filter((s) => s !== "").join("\n");
  return {
    uid: `note-${n.id}`,
    lines: [
      ...when,
      `SUMMARY:${text(n.title)}`,
      ...(description === "" ? [] : [`DESCRIPTION:${text(description)}`]),
      ...(n.pin === null ? [] : [`GEO:${n.pin.lat};${n.pin.lng}`]),
      ...(n.mapsUrl === null ? [] : [`URL:${n.mapsUrl}`]),
    ],
  };
}

function flightEvent(trip: TripSnapshot, leg: Leg, words: CalendarWords): Event | null {
  const f = trip.flights[leg];
  if (f === null) return null;
  const summary = `SUMMARY:${text(words.flight(f.number, f.from, f.to))}`;
  if (f.departs === null) {
    // no time yet: all day on the day it is taken to be
    const [on] = flightDays(f, leg, trip.days);
    return on === undefined
      ? null
      : { uid: `flight-${leg}`, lines: [...allDay(on, on.add({ days: 1 })), summary] };
  }
  // the landing is in another clock, so it can read earlier than the leaving: then it is left out
  const lands =
    f.arrives !== null && Temporal.PlainDateTime.compare(f.arrives, f.departs) > 0
      ? [`DTEND:${time(f.arrives)}`]
      : [];
  return { uid: `flight-${leg}`, lines: [`DTSTART:${time(f.departs)}`, ...lands, summary] };
}

const isShown = (n: Note): n is Scheduled =>
  n.kind === "memo" && n.schedule !== null && n.schedule.status !== "idea";

/** The trip's calendar, as the file's text; `now` stamps each event, `room` makes their ids unique */
export function calendarOf(
  trip: TripSnapshot,
  notes: Note[],
  room: RoomId,
  now: Temporal.Instant,
  words: CalendarWords,
): string {
  const events: Event[] = [
    ...(["out", "back"] as const).flatMap((leg) => flightEvent(trip, leg, words) ?? []),
    ...trip.stays.map((s, i) => ({
      uid: `stay-${i}`,
      lines: [
        ...allDay(s.checkIn, checkOut(s)),
        `SUMMARY:${text(words.stay(s.name))}`,
        ...(s.mapsUrl === null ? [] : [`URL:${s.mapsUrl}`]),
      ],
    })),
    ...notes.filter(isShown).map((n) => noteEvent(n, words)),
  ];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//chirashitabi//booklet//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${text(trip.name)}`,
    ...events.flatMap((e) => [
      "BEGIN:VEVENT",
      `UID:${e.uid}.${room}@chirashitabi.app`,
      `DTSTAMP:${stamp(now)}`,
      ...e.lines,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}
