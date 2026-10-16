import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { hexColor } from "../../shared/color";
import { currencyCode } from "../../shared/money";

import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/id";
import type { Memo, Tag } from "../notes/types";
import type { AirportCode } from "../place/airports";
import type { HttpUrl } from "../place/google-maps";

import type { RoomState } from "./ledger";
import { keep, kept } from "./persist";
import type { Cid } from "./wire";

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
// an id as a room mints it: what is kept is read back with the contract's schemas
const YUKI = "0b0d6f1e-5c1a-4e8b-9a43-7f2d1c6e9a01" as MemberId;
const memo: Memo = {
  id: "n1" as NoteId,
  kind: "memo",
  title: "Din Tai Fung",
  color: "#fff1b8",
  x: 10,
  y: 20,
  rot: 1,
  scale: 1,
  by: YUKI,
  updatedAt: at,
  body: "",
  tags: ["Food" as Tag],
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
  minutes: null,
};
const room: RoomState = {
  notes: [memo],
  trip: {
    name: "Taiwan trip",
    days: [{ date: Temporal.PlainDate.from("2026-11-03"), intro: "Xiaolongbao" }],
    currency: currencyCode("TWD")!,
    center: { lat: 25.05, lng: 121.54 },
    flights: {
      out: {
        number: "BR 191",
        from: "HND" as AirportCode,
        to: "TSA" as AirportCode,
        departs: Temporal.PlainDateTime.from("2026-11-03T08:50"),
        arrives: Temporal.PlainDateTime.from("2026-11-03T11:30"),
      },
      back: null,
    },
    stays: [
      {
        name: "Hotel Proverbs",
        checkIn: Temporal.PlainDate.from("2026-11-03"),
        nights: 1,
        mapsUrl: "https://www.google.com/maps?q=25.04,121.55" as HttpUrl,
        pin: { lat: 25.04, lng: 121.55 },
      },
    ],
  },
  members: [
    {
      id: YUKI,
      kind: "person",
      role: "owner",
      name: "Yuki",
      color: hexColor("#3c6ee0")!,
    },
  ],
};

describe("keep and kept", () => {
  test("a room comes back as it went in, Temporal values and the unanswered changes included", () => {
    const storage = memoryStorage();
    const pending = [
      {
        cid: "c1" as Cid,
        m: { type: "day:intro" as const, date: Temporal.PlainDate.from("2026-11-03"), intro: "x" },
        at,
        by: YUKI,
      },
    ];
    keep(storage, "r1", { me: YUKI, confirmed: room, pending, savedAt: at });
    const back = kept(storage, "r1");
    expect(back?.savedAt.equals(at)).toBe(true);
    expect(back?.me).toBe(YUKI);
    expect(back?.confirmed).toEqual(room);
    expect(back?.pending).toEqual(pending);
    const s = (back?.confirmed.notes[0] as Memo).schedule!;
    expect(s.date).toBeInstanceOf(Temporal.PlainDate);
    expect(s.time?.toString()).toBe("12:30:00");
  });

  test("unanswered changes kept before they were signed are this device's", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as Record<string, unknown>;
    saved.pending = [
      { cid: "c1", m: { type: "day:intro", date: "2026-11-03", intro: "x" }, at: at.toString() },
    ];
    storage.setItem("chirashitabi:room:r1", JSON.stringify(saved));
    expect(kept(storage, "r1")?.pending[0]?.by).toBe(YUKI);
  });

  test("kept without who this device is: nothing, since nothing of it could be signed", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: "" as MemberId, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, "r1")).toBeNull();
  });

  test("rooms are kept apart", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: YUKI, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, "r2")).toBeNull();
  });

  test("unreadable or from another version: nothing", () => {
    const storage = memoryStorage();
    storage.setItem("chirashitabi:room:r1", "{not json");
    expect(kept(storage, "r1")).toBeNull();
    storage.setItem("chirashitabi:room:r1", JSON.stringify({ v: 1 })); // before `me` was kept
    expect(kept(storage, "r1")).toBeNull();
  });

  test("this version's, but not what keep() wrote: nothing", () => {
    const storage = memoryStorage();
    keep(storage, "r1", { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as Record<string, unknown>;
    storage.setItem(
      "chirashitabi:room:r1",
      JSON.stringify({ ...saved, confirmed: { notes: [{ id: "n1" }], trip: null, members: [] } }),
    );
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
      keep(full, "r1", { me: YUKI, confirmed: room, pending: [], savedAt: at }),
    ).not.toThrow();
  });
});
