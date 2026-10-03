import { describe, expect, test } from "vite-plus/test";

import { daysFrom, newRoom, toWire, type RoomForm } from "./newRoom";

const CENTER = { lat: 25.05, lng: 121.54 };
const FORM: RoomForm = {
  name: " Taiwan trip ",
  firstDay: "2026-11-03",
  days: 3,
  currency: "TWD",
  me: "Yuki",
  color: "#3c6ee0",
};

describe("newRoom", () => {
  test("a filled form is a room, names trimmed, days in a row from the first", () => {
    const room = newRoom(FORM, CENTER)!;
    expect(room.trip.name).toBe("Taiwan trip");
    expect(toWire(room).trip.days).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(toWire(room).me).toEqual({ name: "Yuki", color: "#3c6ee0" });
  });

  test.each<[string, Partial<RoomForm>]>([
    ["a blank trip name", { name: "  " }],
    ["a blank member name", { me: "" }],
    ["no first day", { firstDay: "" }],
    ["no days", { days: 0 }],
    ["more days than a room holds", { days: 61 }],
    ["part of a day", { days: 1.5 }],
    ["a currency Intl does not know", { currency: "XXX" }],
    ["a color that is not hex", { color: "red" }],
  ])("not yet a room with %s", (_, change) => {
    expect(newRoom({ ...FORM, ...change }, CENTER)).toBeNull();
  });

  test("days run across a month's end", () => {
    expect(daysFrom(newRoom(FORM, CENTER)!.trip.first.with({ day: 30 }), 3)).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });
});
