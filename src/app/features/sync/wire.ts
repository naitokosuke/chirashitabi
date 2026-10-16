import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import {
  CidSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  IsoTimeSchema,
  type ClientMutation,
  type Cid,
  type IsoDate,
  type IsoDateTime,
  type IsoTime,
  type WireBooking,
  type WireMember,
  type WireMemoPatch,
  type WireMutation,
  type WireFlight,
  type WireNewNote,
  type WireNote,
  type WireSchedule,
  type WireStay,
  type WireTrip,
} from "../../../contract/wire";
import type { Member } from "../members/types";
import type { Booking, MemoPatch, Note, Schedule } from "../notes/types";
import type { Flight, Stay, TripSnapshot } from "../trip/types";

import type { Mutation } from "./types";

// what crosses the socket, and its checks, as the app takes them from the contract
export {
  CidSchema,
  IsoInstantSchema,
  ServerMessageSchema,
  WireMemberSchema,
  WireMutationSchema,
  WireNoteSchema,
  WireTripSchema,
  type ClientMessage,
  type Cid,
  type GoneReason,
  type IsoInstant,
  type RejectReason,
  type ServerMessage,
  type WireMember,
  type WireMutation,
  type WireNote,
  type WireTrip,
} from "../../../contract/wire";

/**
 * The room's JSON back into the app's types. It was read with the contract's schemas as it
 * came (socket.ts, persist.ts), its ids and codes as brands, so this only revives: ISO strings
 * become Temporal values.
 */

const schedule = (s: WireSchedule): Schedule => ({
  date: Temporal.PlainDate.from(s.date),
  time: s.time === null ? null : Temporal.PlainTime.from(s.time),
  status: s.status,
});

const booking = (b: WireBooking): Booking =>
  b.state === "needed"
    ? { state: "needed", by: b.by === null ? null : Temporal.PlainDate.from(b.by) }
    : b;

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
    // nor one kept before a memo said how long it takes
    minutes: n.minutes ?? null,
    // nor one kept before its opening hours were its own
    hours: n.hours ?? null,
    // nor one kept before bookings
    booking: n.booking == null ? null : booking(n.booking),
    // nor one kept before to-dos had a day and someone to do them
    due: n.due == null ? null : Temporal.PlainDate.from(n.due),
    assignee: n.assignee ?? null,
    // nor one kept before spending
    paid: n.paid ?? null,
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
  const { schedule: s, booking: b, due: d, ...rest } = p;
  return {
    ...rest,
    ...(Object.hasOwn(p, "schedule") ? { schedule: s == null ? null : schedule(s) } : {}),
    ...(Object.hasOwn(p, "booking") ? { booking: b == null ? null : booking(b) } : {}),
    ...(Object.hasOwn(p, "due") ? { due: d == null ? null : Temporal.PlainDate.from(d) } : {}),
  };
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

// Temporal writes the very forms the room checks for (YYYY-MM-DD, HH:MM:SS, both with a T);
// one that is not throws here, before the room would refuse it
const isoDate = (d: Temporal.PlainDate): IsoDate => v.parse(IsoDateSchema, d.toString());
const isoTime = (t: Temporal.PlainTime): IsoTime => v.parse(IsoTimeSchema, t.toString());
const isoDateTime = (t: Temporal.PlainDateTime): IsoDateTime =>
  v.parse(IsoDateTimeSchema, t.toString());

/** A new id for one of ours, which the room's answer will name */
export const newCid = (): Cid => v.parse(CidSchema, crypto.randomUUID());

const wireSchedule = (s: Schedule): WireSchedule => ({
  date: isoDate(s.date),
  time: s.time === null ? null : isoTime(s.time),
  status: s.status,
});

const wireBooking = (b: Booking): WireBooking =>
  b.state === "needed" ? { state: "needed", by: b.by === null ? null : isoDate(b.by) } : b;

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
  n.kind === "memo"
    ? {
        ...n,
        schedule: n.schedule === null ? null : wireSchedule(n.schedule),
        booking: n.booking === null ? null : wireBooking(n.booking),
        due: n.due === null ? null : isoDate(n.due),
      }
    : n;

const wirePatch = (p: MemoPatch): WireMemoPatch => {
  const { schedule: s, booking: b, due: d, ...rest } = p;
  return {
    ...rest,
    ...(s === undefined ? {} : { schedule: s === null ? null : wireSchedule(s) }),
    ...(b === undefined ? {} : { booking: b === null ? null : wireBooking(b) }),
    ...(d === undefined ? {} : { due: d === null ? null : isoDate(d) }),
  };
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
