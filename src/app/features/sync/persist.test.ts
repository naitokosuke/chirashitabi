import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { hexColor } from "../../shared/color";
import { currencyCode } from "../../shared/money";

import type { MemberId } from "../members/types";
import type { Memo, NoteId } from "../notes/types";

import type { RoomState } from "./ledger";
import { keep, kept } from "./persist";

/** A Storage that lives in a Map */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const at = Temporal.Instant.from("2026-11-03T03:00:00Z");
const memo: Memo = {
  id: "n1" as NoteId,
  kind: "memo",
  title: "Din Tai Fung",
  color: "#fff1b8",
  x: 10,
  y: 20,
  rot: 1,
  scale: 1,
  by: "yuki" as MemberId,
  updatedAt: at,
  body: "",
  tags: ["Food"],
  mapsUrl: null,
  pin: { lat: 25.03, lng: 121.56 },
  schedule: {
    date: Temporal.PlainDate.from("2026-11-03"),
    time: Temporal.PlainTime.from("12:30"),
    status: "fixed",
  },
  budget: 700,
  checked: false,
  image: null,
};
const room: RoomState = {
  notes: [memo],
  trip: {
    name: "Taiwan trip",
    days: [{ date: Temporal.PlainDate.from("2026-11-03"), intro: "Xiaolongbao" }],
    currency: currencyCode("TWD")!,
    center: { lat: 25.05, lng: 121.54 },
  },
  members: [{ id: "yuki" as MemberId, name: "Yuki", color: hexColor("#3c6ee0")! }],
};

describe("keep and kept", () => {
  test("a room comes back as it went in, Temporal values and the unanswered changes included", () => {
    const storage = memoryStorage();
    const pending = [
      {
        cid: "c1",
        m: { type: "day:intro" as const, date: Temporal.PlainDate.from("2026-11-03"), intro: "x" },
        at,
        by: "yuki" as MemberId,
      },
    ];
    keep(storage, "r1", { me: "yuki" as MemberId, confirmed: room, pending, savedAt: at });
    const back = kept(storage, "r1");
    expect(back?.savedAt.equals(at)).toBe(true);
    expect(back?.me).toBe("yuki");
    expect(back?.confirmed).toEqual(room);
    expect(back?.pending).toEqual(pending);
    const s = (back?.confirmed.notes[0] as Memo).schedule!;
    expect(s.date).toBeInstanceOf(Temporal.PlainDate);
    expect(s.time?.toString()).toBe("12:30:00");
  });

  test("unanswered changes kept before they were signed are this device's", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: "yuki" as MemberId, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!);
    saved.pending = [
      { cid: "c1", m: { type: "day:intro", date: "2026-11-03", intro: "x" }, at: at.toString() },
    ];
    storage.setItem("chirashitabi:room:r1", JSON.stringify(saved));
    expect(kept(storage, "r1")?.pending[0]?.by).toBe("yuki");
  });

  test("kept without who this device is: nothing, since nothing of it could be signed", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: "" as MemberId, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, "r1")).toBeNull();
  });

  test("rooms are kept apart", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: "yuki" as MemberId, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, "r2")).toBeNull();
  });

  test("unreadable or from another version: nothing", () => {
    const storage = memoryStorage();
    storage.setItem("chirashitabi:room:r1", "{not json");
    expect(kept(storage, "r1")).toBeNull();
    storage.setItem("chirashitabi:room:r1", JSON.stringify({ v: 1 })); // before `me` was kept
    expect(kept(storage, "r1")).toBeNull();
  });

  test("a storage that refuses keeps nothing and throws nothing", () => {
    const full = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as Storage;
    expect(() =>
      keep(full, "r1", { me: "yuki" as MemberId, confirmed: room, pending: [], savedAt: at }),
    ).not.toThrow();
  });
});
