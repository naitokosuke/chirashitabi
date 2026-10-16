import { describe, expect, test } from "vite-plus/test";

import { fitHours, openOn, readHours, spansText, type Week } from "./hours";

const at = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** Each day's spans as they read, Monday first */
const text = (week: Week | null) => week?.map(spansText) ?? null;
const read = (value: string) => {
  const week = readHours(value);
  if (week === null) throw new Error(`unread: ${value}`);
  return week;
};
const [MO, , , , FR, SA, SU] = [0, 1, 2, 3, 4, 5, 6];

describe("readHours", () => {
  test("weekdays and times, a later rule overriding the days it names", () => {
    expect(text(readHours("Mo-Fr 09:00-18:00; Sa 10:00-17:00; Su off"))).toEqual([
      "09:00–18:00",
      "09:00–18:00",
      "09:00–18:00",
      "09:00–18:00",
      "09:00–18:00",
      "10:00–17:00",
      "",
    ]);
    expect(text(readHours("Mo-Su 11:00-21:00; We off"))?.[2]).toBe("");
  });

  test("a day not named is closed; times alone hold for every day; 24/7 is always open", () => {
    expect(text(readHours("Tu-Su 11:00-14:30, 17:00-21:00"))?.slice(0, 2)).toEqual([
      "",
      "11:00–14:30, 17:00–21:00",
    ]);
    expect(new Set(text(readHours("10:00-22:00")))).toEqual(new Set(["10:00–22:00"]));
    expect(new Set(text(readHours("24/7")))).toEqual(new Set(["00:00–24:00"]));
  });

  test("a range wraps past Sunday, a list names each, and holidays alone change nothing", () => {
    expect(text(readHours("Fr-Mo 18:00-23:00"))).toEqual([
      "18:00–23:00",
      "",
      "",
      "",
      "18:00–23:00",
      "18:00–23:00",
      "18:00–23:00",
    ]);
    expect(text(readHours("Sa, Su 10:00-16:00; PH off"))?.slice(5)).toEqual([
      "10:00–16:00",
      "10:00–16:00",
    ]);
    expect(text(readHours("Mo-Fr,PH 08:00-12:00"))?.[MO]).toBe("08:00–12:00");
  });

  test("a span ending before it starts runs past midnight; an open end runs to midnight", () => {
    expect(read("Fr 18:00-02:00")[FR]).toEqual([{ from: at("18:00"), to: at("26:00") }]);
    expect(text(readHours("Sa 18:00+"))?.[SA]).toBe("18:00–24:00");
  });

  test("anything past the common syntax leaves the whole value unread", () => {
    for (const value of [
      "",
      "Jan-Mar Mo 10:00-12:00",
      "sunrise-sunset",
      'Mo-Fr 10:00-18:00 "by appointment"',
      "Mo-Fr 25:00-26:00",
      "Mo-Fr 10:00-10:00",
      "Monday 10:00-18:00",
    ])
      expect(readHours(value)).toBeNull();
  });
});

describe("openOn and fitHours", () => {
  const late = read("Mo-Th 11:00-21:00; Fr,Sa 11:00-02:00; Su off");

  test("a day opens with what the night before ran past midnight", () => {
    expect(openOn(late, SA)).toEqual([
      { from: 0, to: at("02:00") },
      { from: at("11:00"), to: at("26:00") },
    ]);
    expect(openOn(late, SU)).toEqual([{ from: 0, to: at("02:00") }]);
  });

  test("open, closed that day, shut at that time, or closing before the plan ends", () => {
    expect(fitHours(late, MO, at("12:00"), 60)).toEqual({ kind: "open" });
    expect(fitHours(late, MO, at("12:00"), null)).toEqual({ kind: "open" });
    expect(fitHours(late, MO, at("09:00"), 60)).toEqual({ kind: "shut" });
    expect(fitHours(late, MO, at("20:30"), 60)).toEqual({ kind: "closes", at: at("21:00") });
    expect(fitHours(late, SA, at("01:00"), 30)).toEqual({ kind: "open" });
    expect(fitHours(late, SA, at("23:30"), 180)).toEqual({ kind: "closes", at: at("02:00") });
    expect(fitHours(read("Mo-Fr 10:00-18:00"), SU, at("12:00"), 60)).toEqual({ kind: "closed" });
    // any time: only a day closed all day is worth saying
    expect(fitHours(read("Mo-Fr 10:00-18:00"), SU, null, 60)).toEqual({ kind: "closed" });
    expect(fitHours(read("Mo-Fr 10:00-18:00"), MO, null, 600)).toEqual({ kind: "open" });
  });
});
