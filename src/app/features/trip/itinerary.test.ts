import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";
import type { Memo, NoteStatus, Scheduled } from "../notes/types";
import type { AirportCode } from "../place/airports";
import type { DayDraft } from "../worker/types";

import { draftUpdates, endOf, flightDays, forDay, stayOn, timing, wakeAt } from "./itinerary";
import type { Stay } from "./types";

const day = Temporal.PlainDate.from("2026-11-03");

function memo(id: string, time: string | null, status: NoteStatus, editedAt: string): Memo {
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
    updatedAt: Temporal.Instant.from(editedAt),
    body: "",
    tags: [],
    mapsUrl: null,
    pin: null,
    schedule: { date: day, time: time === null ? null : Temporal.PlainTime.from(time), status },
    budget: null,
    checked: false,
    image: null,
    minutes: null,
    hours: null,
    booking: null,
  };
}

const ids = (notes: Memo[]) => notes.map((n) => n.id);

/** A confirmed memo on the day at `time`, taking `minutes` */
const planned = (id: string, time: string | null, minutes: number | null): Scheduled => {
  const n = memo(id, time, "fixed", "2026-10-01T00:00:00Z");
  return {
    ...n,
    minutes,
    schedule: { date: day, time: n.schedule?.time ?? null, status: "fixed" },
  };
};

describe("endOf", () => {
  test("a memo ends its minutes after it starts, past midnight on the clock", () => {
    expect(endOf(planned("lunch", "12:30", 90))?.toString()).toBe("14:00:00");
    expect(endOf(planned("late", "23:30", 60))?.toString()).toBe("00:30:00");
  });

  test("without a time or minutes there is no end to say", () => {
    expect(endOf(planned("anytime", null, 90))).toBeNull();
    expect(endOf(planned("open", "12:30", null))).toBeNull();
  });
});

describe("timing", () => {
  test("starting before the one before ends is an overlap, by how much", () => {
    expect(timing(planned("a", "10:00", 90), planned("b", "11:00", 30), 0)).toEqual({
      kind: "overlap",
      minutes: 30,
    });
  });

  test("a gap shorter than the way between is tight; as long or longer works", () => {
    const a = planned("a", "10:00", 60);
    expect(timing(a, planned("b", "11:15", 30), 20)).toEqual({ kind: "tight", gap: 15, way: 20 });
    expect(timing(a, planned("b", "11:20", 30), 20)).toBeNull();
  });

  test("nothing is said when a time or the first one's minutes are missing", () => {
    expect(timing(planned("a", "10:00", null), planned("b", "10:05", 30), 20)).toBeNull();
    expect(timing(planned("a", null, 60), planned("b", "10:05", 30), 20)).toBeNull();
    expect(timing(planned("a", "10:00", 60), planned("b", null, 30), 20)).toBeNull();
  });
});

describe("draftUpdates", () => {
  const draftOf = (items: DayDraft["items"]): DayDraft => ({
    by: null,
    reason: "",
    intro: "",
    items,
  });
  const at = (t: string) => Temporal.PlainTime.from(t);

  test("a time confirms the item; minutes go only where the memo said none", () => {
    const open = planned("open", null, null);
    const set = planned("set", null, 45);
    const updates = draftUpdates(
      draftOf([
        { note: open, time: at("10:00"), minutes: 60 },
        { note: set, time: at("12:00"), minutes: 90 },
      ]),
    );
    expect(updates).toEqual([
      {
        id: open.id,
        patch: { schedule: { date: day, time: at("10:00"), status: "fixed" }, minutes: 60 },
      },
      { id: set.id, patch: { schedule: { date: day, time: at("12:00"), status: "fixed" } } },
    ]);
  });

  test("an item with no time keeps its schedule but still learns how long it takes", () => {
    const loose = planned("loose", null, null);
    expect(draftUpdates(draftOf([{ note: loose, time: null, minutes: 30 }]))).toEqual([
      { id: loose.id, patch: { minutes: 30 } },
    ]);
    expect(draftUpdates(draftOf([{ note: loose, time: null, minutes: null }]))).toEqual([]);
  });
});

describe("forDay", () => {
  test("orders by time, untimed last", () => {
    const notes = [
      memo("anytime", null, "idea", "2026-10-01T00:00:00Z"),
      memo("dinner", "19:00", "idea", "2026-10-01T00:00:00Z"),
      memo("lunch", "12:00", "idea", "2026-10-01T00:00:00Z"),
    ];
    expect(ids(forDay(notes, day))).toEqual(["lunch", "dinner", "anytime"]);
  });

  test("a later edit does not move a card past others at the same time", () => {
    // "first" was written first but edited (e.g. its status tapped) last
    const notes = [
      memo("first", "12:00", "done", "2026-10-02T00:00:00Z"),
      memo("second", "12:00", "idea", "2026-10-01T00:00:00Z"),
      memo("loose-a", null, "fixed", "2026-10-02T00:00:00Z"),
      memo("loose-b", null, "idea", "2026-10-01T00:00:00Z"),
    ];
    expect(ids(forDay(notes, day))).toEqual(["first", "second", "loose-a", "loose-b"]);
  });
});

describe("stayOn and wakeAt", () => {
  const stay = (name: string, checkIn: string, nights: number): Stay => ({
    name,
    checkIn: Temporal.PlainDate.from(checkIn),
    nights,
    mapsUrl: null,
    pin: null,
  });
  const stays = [stay("Taipei", "2026-11-03", 2), stay("Jiufen", "2026-11-05", 1)];
  const at = (d: string) => Temporal.PlainDate.from(d);

  test("a night belongs to the stay from its check-in until the morning it is left", () => {
    expect(stayOn(stays, at("2026-11-02"))).toBeUndefined();
    expect(stayOn(stays, at("2026-11-03"))?.name).toBe("Taipei");
    expect(stayOn(stays, at("2026-11-04"))?.name).toBe("Taipei");
    expect(stayOn(stays, at("2026-11-05"))?.name).toBe("Jiufen");
    expect(stayOn(stays, at("2026-11-06"))).toBeUndefined();
  });

  test("a day begins where the night before was spent", () => {
    expect(wakeAt(stays, at("2026-11-03"))).toBeUndefined();
    expect(wakeAt(stays, at("2026-11-05"))?.name).toBe("Taipei");
    expect(wakeAt(stays, at("2026-11-06"))?.name).toBe("Jiufen");
  });
});

describe("flightDays", () => {
  const days = [0, 1, 2].map((i) => ({ date: day.add({ days: i }) }));
  const flight = {
    number: "",
    from: "HND" as AirportCode,
    to: "TSA" as AirportCode,
    departs: null,
    arrives: null,
  };

  test("with no times, the way there is on the first day and the way home on the last", () => {
    expect(flightDays(flight, "out", days).map(String)).toEqual(["2026-11-03"]);
    expect(flightDays(flight, "back", days).map(String)).toEqual(["2026-11-05"]);
    expect(flightDays(flight, "out", [])).toEqual([]);
  });

  test("with times, the days they say", () => {
    const timed = {
      ...flight,
      departs: Temporal.PlainDateTime.from("2026-11-04T23:30"),
      arrives: Temporal.PlainDateTime.from("2026-11-05T02:10"),
    };
    expect(flightDays(timed, "out", days).map(String)).toEqual(["2026-11-04", "2026-11-05"]);
  });
});
