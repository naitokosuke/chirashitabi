import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { CurrencyCode } from "../../../contract";
import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";
import type { Memo, NoteStatus } from "../notes/types";
import type { AirportCode } from "../place/airports";
import type { HttpUrl } from "../place/google-maps";
import type { RoomId } from "../rooms/types";

import { calendarOf, fold, type CalendarWords } from "./calendar";
import type { TripSnapshot } from "./types";

const date = (s: string) => Temporal.PlainDate.from(s);
const words: CalendarWords = {
  flight: (number, from, to) => (number === "" ? `${from} → ${to}` : `${number} ${from} → ${to}`),
  stay: (name) => `Stay: ${name}`,
  booked: (code) => `Booked · ${code}`,
};

function memo(id: string, status: NoteStatus, extra: Partial<Memo> = {}): Memo {
  return {
    kind: "memo",
    id: id as NoteId,
    title: id,
    color: "#fff1b8",
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    by: "m" as MemberId,
    updatedAt: Temporal.Instant.from("2026-10-01T00:00:00Z"),
    body: "",
    tags: [],
    mapsUrl: null,
    pin: null,
    schedule: { date: date("2026-11-03"), time: Temporal.PlainTime.from("12:30"), status },
    budget: null,
    checked: false,
    image: null,
    minutes: null,
    hours: null,
    link: null,
    booking: null,
    due: null,
    assignee: null,
    ...extra,
  };
}

const trip: TripSnapshot = {
  name: "Taiwan, at last",
  days: ["2026-11-03", "2026-11-04", "2026-11-05"].map((d) => ({ date: date(d), intro: "" })),
  currency: "TWD" as CurrencyCode,
  center: { lat: 25, lng: 121.5 },
  flights: {
    out: {
      number: "BR 191",
      from: "HND" as AirportCode,
      to: "TSA" as AirportCode,
      departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
      arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
    },
    back: {
      number: "",
      from: "TSA" as AirportCode,
      to: "HND" as AirportCode,
      departs: null,
      arrives: null,
    },
  },
  stays: [
    {
      name: "Hotel Proverbs",
      checkIn: date("2026-11-03"),
      nights: 2,
      mapsUrl: "https://maps.google.com/?q=hotel" as HttpUrl,
      pin: null,
    },
  ],
};
const now = Temporal.Instant.from("2026-10-16T04:05:06Z");
/** The file's events, each as its unfolded lines */
const events = (ics: string) =>
  ics
    .replace(/\r\n /g, "")
    .split("BEGIN:VEVENT\r\n")
    .slice(1)
    .map((e) => e.split("\r\n").filter((l) => l !== "" && !l.startsWith("END:")));

describe("calendarOf", () => {
  const notes = [
    memo("lunch", "fixed", {
      title: "Din Tai Fung; xiaolongbao, again",
      body: "The main shop\nhas a queue",
      minutes: 90,
      pin: { lat: 25.03, lng: 121.53 },
      mapsUrl: "https://maps.google.com/?q=dtf" as HttpUrl,
      booking: { state: "booked", code: "DTF-1", url: null },
    }),
    memo("maybe", "idea"),
    memo("anytime", "done", {
      schedule: { date: date("2026-11-04"), time: null, status: "done" },
    }),
  ];
  const ics = calendarOf(trip, notes, "room1" as RoomId, now, words);

  test("a calendar of CRLF lines, named after the trip", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Taiwan\\, at last\r\n");
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  test("the flights, the stays and the confirmed notes; a maybe stays out", () => {
    const all = events(ics);
    expect(all.map((e) => e.find((l) => l.startsWith("SUMMARY:")))).toEqual([
      "SUMMARY:BR 191 HND → TSA",
      "SUMMARY:TSA → HND",
      "SUMMARY:Stay: Hotel Proverbs",
      "SUMMARY:Din Tai Fung\\; xiaolongbao\\, again",
      "SUMMARY:anytime",
    ]);
    for (const e of all) expect(e[1]).toBe("DTSTAMP:20261016T040506Z");
  });

  test("a note at a time lasts its minutes, in its own clock; one at any time is all day", () => {
    const [outbound, home, stay, lunch, anytime] = events(ics);
    expect(lunch).toEqual([
      "UID:note-lunch.room1@chirashitabi.app",
      "DTSTAMP:20261016T040506Z",
      "DTSTART:20261103T123000",
      "DURATION:PT90M",
      "SUMMARY:Din Tai Fung\\; xiaolongbao\\, again",
      "DESCRIPTION:The main shop\\nhas a queue\\nBooked · DTF-1",
      "GEO:25.03;121.53",
      "URL:https://maps.google.com/?q=dtf",
    ]);
    expect(anytime?.slice(2, 4)).toEqual([
      "DTSTART;VALUE=DATE:20261104",
      "DTEND;VALUE=DATE:20261105",
    ]);
    // a stay ends the morning it is left; a flight with no time is all day on its day
    expect(stay?.slice(2, 4)).toEqual(["DTSTART;VALUE=DATE:20261103", "DTEND;VALUE=DATE:20261105"]);
    expect(outbound?.slice(2, 4)).toEqual(["DTSTART:20261103T085000", "DTEND:20261103T113000"]);
    expect(home?.slice(2, 4)).toEqual(["DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261106"]);
  });
});

describe("fold", () => {
  test("a line longer than 75 octets goes on, after a space, never inside a character", () => {
    const line = `SUMMARY:${"台北".repeat(30)}`;
    const folded = fold(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(fold("SHORT")).toBe("SHORT");
  });
});
