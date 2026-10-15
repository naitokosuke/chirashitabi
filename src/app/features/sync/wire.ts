import { Temporal } from "temporal-polyfill-lite";

import type {
  ClientMutation,
  Cid,
  IsoDate,
  IsoDateTime,
  IsoTime,
  WireMember,
  WireMemoPatch,
  WireMutation,
  WireFlight,
  WireNewNote,
  WireNote,
  WireSchedule,
  WireStay,
  WireTrip,
} from "../../../contract/wire";
import type { Member } from "../members/types";
import type { MemoPatch, Note, Schedule } from "../notes/types";
import type { Flight, Stay, TripSnapshot } from "../trip/types";

import type { Mutation } from "./types";

// what crosses the socket, as the app takes it from the contract: types only, so the checks
// (and the airports list they load) stay out of the app
export type {
  ClientMessage,
  Cid,
  GoneReason,
  IsoInstant,
  ServerMessage,
  WireMember,
  WireMutation,
  WireNote,
  WireTrip,
} from "../../../contract/wire";

/**
 * The room's JSON back into the app's types. The room has checked every field,
 * and sent its ids and codes as brands, so this only revives: ISO strings become Temporal values.
 */

const schedule = (s: WireSchedule): Schedule => ({
  date: Temporal.PlainDate.from(s.date),
  time: s.time === null ? null : Temporal.PlainTime.from(s.time),
  status: s.status,
});

export function reviveNote(n: WireNote): Note {
  const card = {
    id: n.id,
    title: n.title,
    color: n.color,
    x: n.x,
    y: n.y,
    rot: n.rot,
    // a note kept on a device before cards could be resized is its own size
    scale: n.scale ?? 1,
    by: n.by,
    updatedAt: Temporal.Instant.from(n.updatedAt),
  };
  if (n.kind === "suggestion") return { ...card, kind: "suggestion" };
  if (n.kind === "text") return { ...card, kind: "text" };
  if (n.kind === "sticker") return { ...card, kind: "sticker", image: n.image };
  return {
    ...card,
    kind: "memo",
    body: n.body,
    tags: n.tags,
    mapsUrl: n.mapsUrl,
    pin: n.pin,
    schedule: n.schedule === null ? null : schedule(n.schedule),
    budget: n.budget,
    checked: n.checked,
    // a note kept on a device before pictures has none
    image: n.image ?? null,
  };
}

const reviveFlight = (f: WireFlight | null | undefined): Flight | null =>
  f == null
    ? null
    : {
        number: f.number,
        // the room checked them against the list (worker/airports.ts); one kept on a device from
        // before may not be on it, and is only not found on the map until the room's snapshot
        from: f.from,
        to: f.to,
        departs: f.departs === null ? null : Temporal.PlainDateTime.from(f.departs),
        arrives: f.arrives === null ? null : Temporal.PlainDateTime.from(f.arrives),
      };

export const reviveTrip = (t: WireTrip): TripSnapshot => ({
  name: t.name,
  days: t.days.map((d) => ({ date: Temporal.PlainDate.from(d.date), intro: d.intro })),
  currency: t.currency,
  center: t.center,
  // a trip kept on a device before flights has none
  flights: { out: reviveFlight(t.flights?.out), back: reviveFlight(t.flights?.back) },
  // nor one kept before stays
  stays: (t.stays ?? []).map(reviveStay),
});

const reviveStay = (s: WireStay): Stay => ({ ...s, checkIn: Temporal.PlainDate.from(s.checkIn) });

export const reviveMember = (m: WireMember): Member => {
  const common = { id: m.id, name: m.name, color: m.color };
  // a person kept on a device before roles were sent is a guest until the room's snapshot says
  return m.kind === "agent"
    ? { ...common, kind: "agent" }
    : { ...common, kind: "person", role: m.role === "owner" ? "owner" : "guest" };
};

const revivePatch = (p: WireMemoPatch): MemoPatch => {
  const { schedule: s, ...rest } = p;
  return Object.hasOwn(p, "schedule")
    ? { ...rest, schedule: s === null || s === undefined ? null : schedule(s) }
    : rest;
};

/** A mutation from another member, as the app's `Mutation`; `by` and the stamp travel beside it */
export function reviveMutation(m: WireMutation): Mutation {
  switch (m.type) {
    case "note:add":
      return { type: "note:add", note: reviveNote(m.note) };
    case "note:update":
      return { type: "note:update", id: m.id, patch: revivePatch(m.patch) };
    case "note:recolor":
      return { type: "note:recolor", id: m.id, color: m.color };
    case "note:adopt":
      return { type: "note:adopt", id: m.id };
    case "text:edit":
      return { type: "text:edit", id: m.id, text: m.text };
    case "note:move":
      return {
        type: "note:move",
        id: m.id,
        x: m.x,
        y: m.y,
        ...(m.rot === undefined ? {} : { rot: m.rot }),
        ...(m.scale === undefined ? {} : { scale: m.scale }),
      };
    case "note:delete":
      return { type: "note:delete", id: m.id };
    case "day:intro":
      return { type: "day:intro", date: Temporal.PlainDate.from(m.date), intro: m.intro };
    case "member:profile":
      return { type: "member:profile", name: m.name, color: m.color };
    case "trip:rename":
      return { type: "trip:rename", name: m.name };
    case "trip:dates":
      return { type: "trip:dates", first: Temporal.PlainDate.from(m.first), days: m.days };
    case "trip:flight":
      return { type: "trip:flight", leg: m.leg, flight: reviveFlight(m.flight) };
    case "trip:stays":
      return { type: "trip:stays", stays: m.stays.map(reviveStay) };
  }
}

/*
 * The app's types out to the room's JSON: Temporal values become the ISO strings their toJSON
 * writes, so what is sent is what JSON.stringify made of a `Mutation` before, now checked
 * against what the room reads.
 */

// Temporal writes the very forms the room checks for (YYYY-MM-DD, HH:MM:SS, both with a T)
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
const isoDate = (d: Temporal.PlainDate): IsoDate => d.toString() as IsoDate;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
const isoTime = (t: Temporal.PlainTime): IsoTime => t.toString() as IsoTime;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
const isoDateTime = (t: Temporal.PlainDateTime): IsoDateTime => t.toString() as IsoDateTime;

/** A new id for one of ours, which the room's answer will name */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
export const newCid = (): Cid => crypto.randomUUID() as Cid;

const wireSchedule = (s: Schedule): WireSchedule => ({
  date: isoDate(s.date),
  time: s.time === null ? null : isoTime(s.time),
  status: s.status,
});

const wireFlight = (f: Flight | null): WireFlight | null =>
  f === null
    ? null
    : {
        number: f.number,
        from: f.from,
        to: f.to,
        departs: f.departs === null ? null : isoDateTime(f.departs),
        arrives: f.arrives === null ? null : isoDateTime(f.arrives),
      };

const wireStay = (s: Stay): WireStay => ({ ...s, checkIn: isoDate(s.checkIn) });

const wireNewNote = (n: Extract<Mutation, { type: "note:add" }>["note"]): WireNewNote =>
  n.kind === "memo" ? { ...n, schedule: n.schedule === null ? null : wireSchedule(n.schedule) } : n;

const wirePatch = (p: MemoPatch): WireMemoPatch => {
  const { schedule: s, ...rest } = p;
  return s === undefined ? rest : { ...rest, schedule: s === null ? null : wireSchedule(s) };
};

/** One of ours, as the room reads it */
export function wireMutation(m: Mutation): ClientMutation {
  switch (m.type) {
    case "note:add":
      return { type: "note:add", note: wireNewNote(m.note) };
    case "note:update":
      return { type: "note:update", id: m.id, patch: wirePatch(m.patch) };
    case "day:intro":
      return { type: "day:intro", date: isoDate(m.date), intro: m.intro };
    case "trip:dates":
      return { type: "trip:dates", first: isoDate(m.first), days: m.days };
    case "trip:flight":
      return { type: "trip:flight", leg: m.leg, flight: wireFlight(m.flight) };
    case "trip:stays":
      return { type: "trip:stays", stays: m.stays.map(wireStay) };
    // nothing in these is not JSON already
    case "note:recolor":
    case "note:adopt":
    case "text:edit":
    case "note:move":
    case "note:delete":
    case "member:profile":
    case "trip:rename":
      return m;
  }
}
