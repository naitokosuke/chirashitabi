import { Temporal } from "temporal-polyfill-lite";

import { createApp } from "vue";

import { createPinia, setActivePinia } from "pinia";

import { PiniaColada } from "@pinia/colada";
import { describe, expect, test } from "vite-plus/test";

import { parseCurrencyCode, parseHexColor } from "../../../contract";
import type { Email, MemberId } from "../members/types";
import { parseImageId, type NoteId } from "../notes/id";
import { blankInput } from "../notes/input";
import type { Memo, Tag } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import type { AirportCode } from "../place/airports";
import type { HttpUrl } from "../place/google-maps";
import type { RoomId } from "../rooms/types";

import type { RoomState } from "./ledger";
import { claim, keep, kept, prune } from "./persist";
import type { Mutation } from "./types";
import { useSync } from "./useSync";
import { wireMutation, type Cid } from "./wire";

const R1 = "r1" as RoomId;

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
  hours: null,
  link: null,
  booking: null,
  due: null,
  assignee: null,
};
const room: RoomState = {
  notes: [memo],
  trip: {
    name: "Taiwan trip",
    days: [{ date: Temporal.PlainDate.from("2026-11-03"), intro: "Xiaolongbao" }],
    currency: parseCurrencyCode("TWD")!,
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
      color: parseHexColor("#3c6ee0")!,
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
    keep(storage, R1, { me: YUKI, confirmed: room, pending, savedAt: at });
    const back = kept(storage, R1);
    expect(back?.savedAt.equals(at)).toBe(true);
    expect(back?.me).toBe(YUKI);
    expect(back?.confirmed).toEqual(room);
    expect(back?.pending).toEqual(pending);
    const s = (back?.confirmed.notes[0] as Memo | undefined)?.schedule;
    expect(s?.date).toBeInstanceOf(Temporal.PlainDate);
    expect(s?.time?.toString()).toBe("12:30:00");
  });

  test("unanswered changes kept before they were signed are this device's", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as Record<string, unknown>;
    saved.pending = [
      { cid: "c1", m: { type: "day:intro", date: "2026-11-03", intro: "x" }, at: at.toString() },
    ];
    storage.setItem("chirashitabi:room:r1", JSON.stringify(saved));
    expect(kept(storage, R1)?.pending[0]?.by).toBe(YUKI);
  });

  test("kept without who this device is: nothing, since nothing of it could be signed", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: "" as MemberId, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, R1)).toBeNull();
  });

  test("kept with a trip that does not read: nothing, so the device joins the room afresh", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as {
      confirmed: { trip: Record<string, unknown> };
    };
    for (const trip of [null, { ...saved.confirmed.trip, days: [] }, { name: "Taiwan trip" }]) {
      storage.setItem(
        "chirashitabi:room:r1",
        JSON.stringify({ ...saved, confirmed: { ...saved.confirmed, trip } }),
      );
      expect(kept(storage, R1)).toBeNull();
    }
  });

  test("rooms are kept apart", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, "r2" as RoomId)).toBeNull();
  });

  test("unreadable or from another version: nothing", () => {
    const storage = memoryStorage();
    storage.setItem("chirashitabi:room:r1", "{not json");
    expect(kept(storage, R1)).toBeNull();
    storage.setItem("chirashitabi:room:r1", JSON.stringify({ v: 1 })); // before `me` was kept
    expect(kept(storage, R1)).toBeNull();
  });

  test("a note or a change that does not read is left out; the rest is kept", () => {
    const storage = memoryStorage();
    const pending = [
      { cid: "c1" as Cid, m: { type: "note:delete" as const, id: memo.id }, at, by: YUKI },
    ];
    keep(storage, R1, { me: YUKI, confirmed: room, pending, savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as {
      confirmed: { notes: unknown[] };
      pending: unknown[];
    };
    saved.confirmed.notes.push({ id: "n2" });
    saved.pending.unshift({ cid: "c0", m: { type: "no such change" }, at: at.toString() });
    storage.setItem("chirashitabi:room:r1", JSON.stringify(saved));
    const back = kept(storage, R1);
    expect(back?.confirmed.notes).toEqual([memo]);
    expect(back?.pending).toEqual(pending);
  });

  test("a text box and a sticker kept with a title and a color come back with their own fields", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const saved = JSON.parse(storage.getItem("chirashitabi:room:r1")!) as {
      confirmed: { notes: unknown[] };
      pending: unknown[];
    };
    const where = { x: 0, y: 0, rot: 0, scale: 1 };
    const placed = { ...where, color: "#ffffff" };
    const image = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const stamp = { by: YUKI, updatedAt: at.toString() };
    saved.confirmed.notes.push(
      { ...placed, ...stamp, id: "t1", kind: "text", title: "Day 1" },
      { ...placed, ...stamp, id: "s1", kind: "sticker", title: "", image },
    );
    saved.pending.push({
      cid: "c1",
      m: {
        type: "note:add",
        note: { ...placed, ...stamp, id: "t2", kind: "text", title: "Day 2" },
      },
      at: at.toString(),
      by: YUKI,
    });
    storage.setItem("chirashitabi:room:r1", JSON.stringify(saved));
    const back = kept(storage, R1);
    expect(back?.confirmed.notes.slice(1)).toEqual([
      { ...where, by: YUKI, updatedAt: at, id: "t1", kind: "text", text: "Day 1" },
      { ...where, by: YUKI, updatedAt: at, id: "s1", kind: "sticker", image },
    ]);
    // a stamp kept beside a new note is not its own: the room stamps it once it is sent
    expect(back?.pending[0]?.m).toEqual({
      type: "note:add",
      note: { ...where, id: "t2", kind: "text", text: "Day 2" },
    });
  });

  test("a memo, a text box and a sticker as the app makes them, kept unanswered, come back to be sent", () => {
    const app = createApp({});
    const pinia = createPinia();
    app.use(pinia).use(PiniaColada);
    setActivePinia(pinia);
    const made: Mutation[] = [];
    useSync().transport = { commit: (...ms) => made.push(...ms) > 0, send: () => {} };
    const notes = app.runWithContext(() => useNotes());
    const image = parseImageId("0f8fad5b-d9cb-469f-a165-70867728950e")!;
    notes.add(
      {
        ...blankInput(["Food" as Tag], { lat: 25.03, lng: 121.56 }),
        title: "Din Tai Fung",
        booking: { state: "needed", by: Temporal.PlainDate.from("2026-11-02") },
        due: Temporal.PlainDate.from("2026-11-01"),
      },
      { x: 10, y: 20 },
    );
    notes.addText(" Day 1 ", { x: 0, y: 0 });
    notes.addSticker(image, { x: 30, y: 40 });
    expect(made.map((m) => m.type)).toEqual(["note:add", "note:add", "note:add"]);

    const storage = memoryStorage();
    const pending = made.map((m, i) => ({ cid: `c${i}` as Cid, m, at, by: YUKI }));
    keep(storage, R1, { me: YUKI, confirmed: room, pending, savedAt: at });
    const back = kept(storage, R1);
    expect(back?.pending).toEqual(pending);
    // and sent as they would have been before they were kept
    expect(back?.pending.map((p) => wireMutation(p.m))).toEqual(made.map(wireMutation));
  });

  test("a change kept by a build that did not ask whether it fits a message is left out", () => {
    const storage = memoryStorage();
    const stay = room.trip.stays[0]!;
    const long = `https://www.google.com/maps?q=25.04,121.55&x=${"x".repeat(1900)}` as HttpUrl;
    const stays = Array.from({ length: 60 }, () => ({ ...stay, mapsUrl: long }));
    const pending = [
      { cid: "c1" as Cid, m: { type: "trip:stays" as const, stays }, at, by: YUKI },
      { cid: "c2" as Cid, m: { type: "note:delete" as const, id: memo.id }, at, by: YUKI },
    ];
    keep(storage, R1, { me: YUKI, confirmed: room, pending, savedAt: at });
    expect(kept(storage, R1)?.pending).toEqual([pending[1]]);
  });

  test("a newer version's save is neither read nor written over", () => {
    const storage = memoryStorage();
    const newer = JSON.stringify({ v: 3, anything: "else" });
    storage.setItem("chirashitabi:room:r1", newer);
    expect(kept(storage, R1)).toBeNull();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    expect(storage.getItem("chirashitabi:room:r1")).toBe(newer);
  });

  test("a full storage lets the other rooms go to keep this one", () => {
    const storage = memoryStorage();
    keep(storage, "r2" as RoomId, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    const setItem = storage.setItem.bind(storage);
    // room for one save only
    storage.setItem = (k, value) => {
      if (storage.length > 0 && storage.getItem(k) === null) throw new Error("QuotaExceededError");
      setItem(k, value);
    };
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    expect(kept(storage, R1)?.confirmed).toEqual(room);
    expect(kept(storage, "r2" as RoomId)).toBeNull();
  });

  test("still full: the room's older save goes too, so it brings back nothing answered since", () => {
    const storage = memoryStorage();
    keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() =>
      keep(storage, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at }),
    ).not.toThrow();
    expect(kept(storage, R1)).toBeNull();
  });

  test("a storage that refuses keeps nothing and throws nothing", () => {
    const full = memoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() =>
      keep(full, R1, { me: YUKI, confirmed: room, pending: [], savedAt: at }),
    ).not.toThrow();
  });
});

describe("claim and prune", () => {
  const PAT = "pat@example.com" as Email;
  const SAM = "sam@example.com" as Email;
  const R2 = "r2" as RoomId;
  const both = () => {
    const storage = memoryStorage();
    for (const r of [R1, R2])
      keep(storage, r, { me: YUKI, confirmed: room, pending: [], savedAt: at });
    return storage;
  };

  test("rooms kept before anyone was named are the first person's; theirs stay theirs", () => {
    const storage = both();
    expect(claim(storage, PAT)).toBe(false);
    expect(claim(storage, PAT)).toBe(false);
    expect(kept(storage, R1)).not.toBeNull();
    expect(kept(storage, R2)).not.toBeNull();
  });

  test("another person signed in: every kept room goes", () => {
    const storage = both();
    claim(storage, PAT);
    expect(claim(storage, SAM)).toBe(true);
    expect(kept(storage, R1)).toBeNull();
    expect(kept(storage, R2)).toBeNull();
    // what is kept from now on is theirs
    expect(claim(storage, SAM)).toBe(false);
  });

  test("only the rooms the person is in stay", () => {
    const storage = both();
    storage.setItem("chirashitabi:theme", "dark");
    prune(storage, [R2]);
    expect(kept(storage, R1)).toBeNull();
    expect(kept(storage, R2)).not.toBeNull();
    expect(storage.getItem("chirashitabi:theme")).toBe("dark");
  });
});
