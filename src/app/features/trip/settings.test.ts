import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { parseCurrencyCode } from "../../../contract";
import { airportsOf } from "../place/airports";
import type { HttpUrl } from "../place/google-maps";

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

const airports = airportsOf([
  ["HND", "Tokyo Haneda International Airport", "Tokyo", "JP", 35.5497, 139.787],
  ["TSA", "Taipei Songshan International Airport", "Taipei (Songshan)", "TW", 25.0672, 121.5528],
]);
const [HND, TSA] = airports.map((a) => a.code);

const first = Temporal.PlainDate.from("2026-11-03");
const out = {
  number: "BR 191",
  from: HND!,
  to: TSA!,
  departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
  arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
};
const trip: TripSnapshot = {
  name: "Taiwan trip",
  days: [0, 1, 2, 3].map((i) => ({ date: first.add({ days: i }), intro: "" })),
  currency: parseCurrencyCode("TWD")!,
  center: { lat: 25, lng: 121 },
  flights: { out, back: null },
  stays: [
    {
      name: "Hotel Proverbs",
      checkIn: first,
      nights: 2,
      mapsUrl: "https://www.google.com/maps?q=25.04,121.55" as HttpUrl,
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
    const s = settingsOf(form, airports);
    expect(s?.first.equals(first)).toBe(true);
    expect(sameFlight(s!.flights.out, out)).toBe(true);
    expect(s?.flights.back).toBeNull();
    expect(form.stays[0]).toMatchObject({ checkIn: "2026-11-03", nights: 2 });
    expect(sameStays(s!.stays, trip.stays)).toBe(true);
  });

  test("a blank name, a day that is not one, or a half-written flight is not taken", () => {
    const form = formOf(trip);
    expect(settingsOf({ ...form, name: "  " }, airports)).toBeNull();
    expect(settingsOf({ ...form, firstDay: "" }, airports)).toBeNull();
    expect(settingsOf({ ...form, days: 0 }, airports)).toBeNull();
    const half = { ...newFlight(), from: "TSA" };
    expect(settingsOf({ ...form, flights: { ...form.flights, back: half } }, airports)).toBeNull();
  });
});

describe("newStay and stayOf", () => {
  test("a new stay starts the night the last one ends, or on the first night", () => {
    expect(newStay([], first).checkIn).toBe("2026-11-03");
    expect(newStay(formOf(trip).stays, first).checkIn).toBe("2026-11-05");
  });

  test("its link sets its pin; a blank link clears both; a stay with no name is not one yet", () => {
    const blank = newStay([], first);
    expect(stayOf(blank)).toEqual({ ok: false, reason: "name" });
    const s = stayOf({ ...blank, name: " Inn ", mapsUrl: "https://maps.google.com/?q=25.1,121.8" });
    expect(s).toMatchObject({ ok: true, value: { name: "Inn", pin: { lat: 25.1, lng: 121.8 } } });
    expect(stayOf({ ...blank, name: "Inn", pin: { lat: 1, lng: 2 } })).toMatchObject({
      value: { pin: null },
    });
    expect(stayOf({ ...blank, name: "Inn", mapsUrl: "javascript:alert(1)" })).toEqual({
      ok: false,
      reason: "link",
    });
  });
});

describe("newFlight and flightOf", () => {
  test("a new flight has only its airports to fill in", () => {
    expect(newFlight()).toMatchObject({ on: true, number: "", departs: "", arrives: "" });
  });

  test("a flight that is off is none; its airports are enough, as codes, with no number or times", () => {
    expect(flightOf({ ...newFlight(), on: false }, airports)).toEqual({ ok: true, value: null });
    const f = flightOf({ ...newFlight(), number: " CI 223 ", from: " hnd", to: "松山" }, airports);
    expect(f).toEqual({
      ok: true,
      value: { number: "CI 223", from: HND, to: TSA, departs: null, arrives: null },
    });
  });

  test("an airport not named or not on the list, or a time half typed, is not one yet", () => {
    const notYet = (reason: string) => ({ ok: false, reason });
    expect(flightOf({ ...newFlight(), from: "HND" }, airports)).toEqual(notYet("airport"));
    expect(flightOf({ ...newFlight(), from: "HND", to: "Taipei" }, airports)).toEqual(
      notYet("airport"),
    );
    expect(flightOf({ ...newFlight(), from: "HND", to: "TSA" }, [])).toEqual(notYet("airport"));
    expect(
      flightOf({ ...newFlight(), from: "HND", to: "TSA", departs: "2026-11-03T" }, airports),
    ).toEqual(notYet("time"));
    expect(
      flightOf({ ...newFlight(), from: "HND", to: "TSA", number: "X".repeat(21) }, airports),
    ).toEqual(notYet("number"));
    const timed = flightOf(
      { ...newFlight(), from: "HND", to: "TSA", departs: "2026-11-03T08:50" },
      airports,
    );
    expect(timed.ok && timed.value?.departs?.toString()).toBe("2026-11-03T08:50:00");
    expect(timed.ok && timed.value?.arrives).toBeNull();
  });
});
