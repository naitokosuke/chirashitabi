import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { currencyCode } from "../../shared/money";

import { applyToDays, applyToTrip } from "./apply";
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
  };

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
