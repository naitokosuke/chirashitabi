import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { deletedOf, restoreRoom, summaryOf } from "./api";
import { RoomIdSchema } from "./types";

const ID = "b082573b-b38b-4298-90be-f034f8b7d898";

describe("summaryOf", () => {
  test("reads an entry of the list this device kept", () => {
    const s = summaryOf({
      id: ID,
      name: "Taiwan trip",
      first: "2026-11-03",
      days: 3,
      members: [
        { kind: "person", name: "Yuki", color: "#3c6ee0" },
        { kind: "agent", name: "Claude", color: "#d97757" },
      ],
      memos: 12,
    });
    expect(s?.first?.equals(Temporal.PlainDate.from("2026-11-03"))).toBe(true);
    expect(s).toMatchObject({ id: ID, name: "Taiwan trip", days: 3, memos: 12 });
    expect(s?.members.map((m) => m.name)).toEqual(["Yuki", "Claude"]);
  });

  test("leaves out an entry without a room id or a name", () => {
    expect(summaryOf({ id: "nope", name: "x" })).toBeNull();
    expect(summaryOf({ id: ID })).toBeNull();
    expect(summaryOf(null)).toBeNull();
  });

  test("keeps a trip whose glance is missing or odd, with that part empty", () => {
    expect(summaryOf({ id: ID, name: "Old" })).toEqual({
      id: ID,
      name: "Old",
      first: null,
      days: 0,
      members: [],
      memos: 0,
      owner: false,
    });
    const s = summaryOf({
      id: ID,
      name: "Odd",
      first: "2026-02-30",
      days: -1,
      members: [{ kind: "person", name: "X", color: "red; background: url(x)" }, "junk"],
      memos: 1.5,
    });
    expect(s).toMatchObject({ first: null, days: 0, members: [], memos: 0 });
  });
});

describe("deletedOf", () => {
  test("reads a deleted trip, restorable for thirty days from the day it was deleted", () => {
    const at = Temporal.Instant.from("2026-10-04T03:00:00Z");
    const d = deletedOf({ id: ID, name: "Old trip", deletedAt: at.toString() });
    const day = at.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate();
    expect(d).toMatchObject({ id: ID, name: "Old trip" });
    expect(d?.until.equals(day.add({ days: 30 }))).toBe(true);
  });

  test("leaves out an entry without a room id, a name or a time", () => {
    expect(deletedOf({ id: ID, name: "x" })).toBeNull();
    expect(deletedOf({ id: ID, name: "x", deletedAt: "yesterday" })).toBeNull();
    expect(deletedOf({ id: "nope", name: "x", deletedAt: "2026-10-04T03:00:00Z" })).toBeNull();
  });
});

describe("restoreRoom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("one the other person brought back first is refused as not deleted, not thrown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "not a member" }, { status: 403 })),
    );
    expect(await restoreRoom(v.parse(RoomIdSchema, ID))).toEqual({
      ok: false,
      reason: "not deleted",
    });
  });
});
