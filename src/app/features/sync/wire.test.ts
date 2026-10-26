import { Temporal } from "temporal-polyfill-lite";

import { describe, expect, test } from "vite-plus/test";

import { parseHexColor } from "../../../contract";
import type { ImageId, NoteId } from "../notes/id";
import type { NewMemo, Tag } from "../notes/types";
import type { AirportCode } from "../place/airports";

import type { Mutation } from "./types";
import { reviveMutation, wireMutation, type WireMutation } from "./wire";

const id = "a" as NoteId;
const memo: NewMemo = {
  id,
  kind: "memo",
  title: "Din Tai Fung",
  body: "",
  tags: ["food" as Tag],
  color: "#fff1b8",
  x: 10,
  y: 20,
  rot: 1,
  scale: 1,
  mapsUrl: null,
  pin: { lat: 25.03, lng: 121.56 },
  schedule: {
    date: Temporal.PlainDate.from("2026-11-03"),
    time: Temporal.PlainTime.from("12:30"),
    status: "fixed",
  },
  budget: 1500,
  checked: false,
  image: null,
  minutes: null,
  hours: null,
  link: null,
  booking: null,
  due: null,
  assignee: null,
};
const flight = {
  number: "BR 191",
  from: "HND" as AirportCode,
  to: "TSA" as AirportCode,
  departs: Temporal.PlainDateTime.from("2026-11-03T08:55"),
  arrives: null,
};
const stay = {
  name: "Hotel",
  checkIn: Temporal.PlainDate.from("2026-11-03"),
  nights: 3,
  mapsUrl: null,
  pin: null,
};

/** One of every mutation the app sends, with every Temporal value it can carry */
const MUTATIONS: Mutation[] = [
  { type: "note:add", note: memo },
  { type: "note:add", note: { ...memo, schedule: null } },
  {
    type: "note:add",
    note: { id, kind: "text", text: "Day 1", x: 0, y: 0, rot: 0, scale: 1 },
  },
  {
    type: "note:add",
    note: {
      id,
      kind: "sticker",
      image: "0f8fad5b-d9cb-469f-a165-70867728950e" as ImageId,
      x: 0,
      y: 0,
      rot: 2,
      scale: 1,
    },
  },
  { type: "note:update", id, patch: { title: "Ding Tai Fung" } },
  { type: "note:update", id, patch: { schedule: memo.schedule } },
  { type: "note:update", id, patch: { schedule: null, pin: null } },
  {
    type: "note:update",
    id,
    patch: { booking: { state: "needed", by: Temporal.PlainDate.from("2026-10-20") } },
  },
  { type: "note:update", id, patch: { booking: { state: "needed", by: null } } },
  { type: "note:update", id, patch: { booking: { state: "booked", code: "A1", url: null } } },
  { type: "note:update", id, patch: { booking: null, minutes: 90, hours: "Mo-Su 10:00-20:00" } },
  {
    type: "note:add",
    note: { ...memo, booking: { state: "needed", by: Temporal.PlainDate.from("2026-10-20") } },
  },
  { type: "note:recolor", id, color: "#ffd9de" },
  { type: "note:adopt", id },
  { type: "text:edit", id, text: "Day 2" },
  { type: "note:move", id, x: 1, y: 2 },
  { type: "note:move", id, x: 1, y: 2, rot: 3, scale: 1.5 },
  { type: "note:delete", id },
  { type: "day:intro", date: Temporal.PlainDate.from("2026-11-04"), intro: "Jiufen" },
  { type: "member:profile", name: "Yuki", color: parseHexColor("#3c6ee0")! },
  { type: "trip:rename", name: "Taiwan" },
  { type: "trip:dates", first: Temporal.PlainDate.from("2026-11-03"), days: 4 },
  { type: "trip:flight", leg: "out", flight },
  { type: "trip:flight", leg: "back", flight: null },
  { type: "trip:stays", stays: [stay] },
];

describe("a mutation out to the room", () => {
  test.each(MUTATIONS.map((m) => [m.type, m] as const))(
    "%s is sent as JSON.stringify wrote it",
    (_, m) => {
      // the same JSON, field for field; only the order of a patch's fields may differ
      expect(JSON.parse(JSON.stringify(wireMutation(m)))).toEqual(JSON.parse(JSON.stringify(m)));
    },
  );

  test("revives as it was", () => {
    for (const m of MUTATIONS.filter((m) => m.type !== "note:add")) {
      // what the room relays of ours is what we sent, so it comes back the same
      const relayed = JSON.parse(JSON.stringify(wireMutation(m))) as WireMutation;
      expect(reviveMutation(relayed)).toEqual(m);
    }
  });
});
