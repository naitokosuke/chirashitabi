import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { currencyCode } from "../../shared/money";

import {
  flightOf,
  formOf,
  newFlight,
  newStay,
  sameFlight,
  sameStays,
  settingsOf,
  stayOf,
} from "./settings";
import type { TripSnapshot } from "./types";

const first = Temporal.PlainDate.from("2026-11-03");
const out = {
  number: "BR 191",
  from: "HND",
  to: "TSA",
  departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
  arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
};
const trip: TripSnapshot = {
  name: "Taiwan trip",
  days: [0, 1, 2, 3].map((i) => ({ date: first.add({ days: i }), intro: "" })),
  currency: currencyCode("TWD")!,
  center: { lat: 25, lng: 121 },
  flights: { out, back: null },
  stays: [
    {
      name: "Hotel Proverbs",
      checkIn: first,
      nights: 2,
      mapsUrl: "https://www.google.com/maps?q=25.04,121.55",
      pin: { lat: 25.04, lng: 121.55 },
    },
  ],
};

describe("formOf and settingsOf", () => {
  test("a trip goes into the inputs and comes back out as it was", () => {
    const form = formOf(trip);
    expect(form).toMatchObject({ name: "Taiwan trip", firstDay: "2026-11-03", days: 4 });
    expect(form.flights.out).toMatchObject({ on: true, departs: "2026-11-03T08:50" });
    expect(form.flights.back.on).toBe(false);
    const s = settingsOf(form);
    expect(s?.first.equals(first)).toBe(true);
    expect(sameFlight(s!.flights.out, out)).toBe(true);
    expect(s?.flights.back).toBeNull();
    expect(form.stays[0]).toMatchObject({ checkIn: "2026-11-03", nights: 2 });
    expect(sameStays(s!.stays, trip.stays)).toBe(true);
  });

  test("a blank name, a day that is not one, or a half-written flight is not taken", () => {
    const form = formOf(trip);
    expect(settingsOf({ ...form, name: "  " })).toBeNull();
    expect(settingsOf({ ...form, firstDay: "" })).toBeNull();
    expect(settingsOf({ ...form, days: 0 })).toBeNull();
    const half = { ...newFlight(), from: "TSA" };
    expect(settingsOf({ ...form, flights: { ...form.flights, back: half } })).toBeNull();
  });
});

describe("newStay and stayOf", () => {
  test("a new stay starts the night the last one ends, or on the first night", () => {
    expect(newStay([], first).checkIn).toBe("2026-11-03");
    expect(newStay(formOf(trip).stays, first).checkIn).toBe("2026-11-05");
  });

  test("its link sets its pin; a blank link clears both; a stay with no name is not one yet", () => {
    const blank = newStay([], first);
    expect(stayOf(blank)).toBeUndefined();
    const s = stayOf({ ...blank, name: " Inn ", mapsUrl: "https://maps.google.com/?q=25.1,121.8" });
    expect(s).toMatchObject({ name: "Inn", pin: { lat: 25.1, lng: 121.8 } });
    expect(stayOf({ ...blank, name: "Inn", pin: { lat: 1, lng: 2 } })?.pin).toBeNull();
    expect(stayOf({ ...blank, name: "Inn", mapsUrl: "javascript:alert(1)" })).toBeUndefined();
  });
});

describe("newFlight and flightOf", () => {
  test("a new flight has only its airports to fill in", () => {
    expect(newFlight()).toMatchObject({ on: true, number: "", departs: "", arrives: "" });
  });

  test("a flight that is off is none; its airports are enough, trimmed, with no number or times", () => {
    expect(flightOf({ ...newFlight(), on: false })).toBeNull();
    const f = flightOf({ ...newFlight(), number: " CI 223 ", from: " HND", to: "TSA " });
    expect(f).toEqual({ number: "CI 223", from: "HND", to: "TSA", departs: null, arrives: null });
  });

  test("an airport not named, or a time half typed, is not one yet", () => {
    expect(flightOf({ ...newFlight(), from: "HND" })).toBeUndefined();
    expect(
      flightOf({ ...newFlight(), from: "HND", to: "TSA", departs: "2026-11-03T" }),
    ).toBeUndefined();
    const timed = flightOf({ ...newFlight(), from: "HND", to: "TSA", departs: "2026-11-03T08:50" });
    expect(timed?.departs?.toString()).toBe("2026-11-03T08:50:00");
    expect(timed?.arrives).toBeNull();
  });
});
