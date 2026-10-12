import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { currencyCode } from "../../shared/money";

import type { NoteId } from "../notes/id";
import type { Memo, Note } from "../notes/types";
import type { AirportCode } from "../place/airports";

import { applyToDays, applyToTrip, moveSchedules } from "./apply";
import type { Day, TripSnapshot } from "./types";

const d1 = Temporal.PlainDate.from("2026-11-03");
const d2 = Temporal.PlainDate.from("2026-11-04");

describe("applyToDays", () => {
  test("an intro changes that day only, as a new object", () => {
    const days: Day[] = [
      { date: d1, intro: "" },
      { date: d2, intro: "" },
    ];
    const next = applyToDays(days, { type: "day:intro", date: d2, intro: "Jiufen" });
    expect(next[0]).toBe(days[0]);
    expect(next[1]).toEqual({ date: d2, intro: "Jiufen" });
    expect(days[1]?.intro).toBe("");
  });

  test("the same intro, an unknown day or another mutation keeps the array", () => {
    const days: Day[] = [{ date: d1, intro: "a" }];
    expect(applyToDays(days, { type: "day:intro", date: d1, intro: "a" })).toBe(days);
    expect(applyToDays(days, { type: "day:intro", date: d2, intro: "b" })).toBe(days);
    expect(applyToDays(days, { type: "note:delete", id: "x" as never })).toBe(days);
  });
});

describe("applyToTrip", () => {
  const trip: TripSnapshot = {
    name: "Taiwan trip",
    days: [{ date: d1, intro: "" }],
    currency: currencyCode("TWD")!,
    center: { lat: 25, lng: 121 },
    flights: { out: null, back: null },
    stays: [],
  };

  test("the stays are replaced as a list", () => {
    const stays = [{ name: "Inn", checkIn: d1, nights: 1, mapsUrl: null, pin: null }];
    expect(applyToTrip(trip, { type: "trip:stays", stays }).stays).toBe(stays);
  });

  test("new dates: the run of days from the first, each day keeping its place's intro", () => {
    const two = {
      ...trip,
      days: [
        { date: d1, intro: "Arrive" },
        { date: d2, intro: "Jiufen" },
      ],
    };
    const d0 = d1.subtract({ days: 7 });
    const next = applyToTrip(two, { type: "trip:dates", first: d0, days: 3 });
    expect(next.days.map((d) => [d.date.toString(), d.intro])).toEqual([
      ["2026-10-27", "Arrive"],
      ["2026-10-28", "Jiufen"],
      ["2026-10-29", ""],
    ]);
    expect(applyToTrip(two, { type: "trip:dates", first: d1, days: 2 })).toBe(two);
  });

  test("a flight is set and taken away, the other kept", () => {
    const out = {
      number: "BR 191",
      from: "HND" as AirportCode,
      to: "TSA" as AirportCode,
      departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
      arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
    };
    const set = applyToTrip(trip, { type: "trip:flight", leg: "out", flight: out });
    expect(set.flights).toEqual({ out, back: null });
    expect(applyToTrip(set, { type: "trip:flight", leg: "out", flight: null }).flights).toEqual({
      out: null,
      back: null,
    });
  });

  test("a new name changes the name only, as a new object", () => {
    const next = applyToTrip(trip, { type: "trip:rename", name: "台湾の秋" });
    expect(next).toEqual({ ...trip, name: "台湾の秋" });
    expect(next.days).toBe(trip.days);
    expect(trip.name).toBe("Taiwan trip");
  });

  test("an intro goes to its day; the same name or another mutation keeps the trip", () => {
    expect(applyToTrip(trip, { type: "day:intro", date: d1, intro: "x" }).days[0]?.intro).toBe("x");
    expect(applyToTrip(trip, { type: "trip:rename", name: "Taiwan trip" })).toBe(trip);
    expect(applyToTrip(trip, { type: "note:delete", id: "x" as never })).toBe(trip);
  });
});

describe("moveSchedules", () => {
  const at = Temporal.Instant.from("2026-10-04T00:00:00Z");
  const planned = (id: string, date: Temporal.PlainDate): Memo =>
    ({
      id: id as NoteId,
      kind: "memo",
      title: id,
      schedule: { date, time: null, status: "idea" },
    }) as Memo;

  test("planned notes move with the first day; one past the new last day loses its day", () => {
    const notes: Note[] = [planned("a", d1), planned("b", d2)];
    // from 11/3 for two days to 11/10 for one day: a moves to 11/10, b (11/11) falls off
    const next = moveSchedules(
      notes,
      d1,
      { type: "trip:dates", first: d1.add({ days: 7 }), days: 1 },
      at,
    );
    expect(
      next.map((n) => (n.kind === "memo" ? (n.schedule?.date.toString() ?? null) : null)),
    ).toEqual(["2026-11-10", null]);
  });

  test("same first day and room for every plan: the notes are kept as they were", () => {
    const notes: Note[] = [planned("a", d1)];
    expect(moveSchedules(notes, d1, { type: "trip:dates", first: d1, days: 3 }, at)).toBe(notes);
  });
});
