import { Temporal } from "temporal-polyfill-lite";

import { hexColor } from "../../shared/color";
import { currencyCode } from "../../shared/money";

import type {
  WireMember,
  WireMemoPatch,
  WireMutation,
  WireNote,
  WireSchedule,
  WireTrip,
} from "../../../../worker/wire";
import type { Member, MemberId } from "../members/types";
import type { ImageId, Memo, MemoPatch, Note, NoteId, Schedule } from "../notes/types";
import type { TripSnapshot } from "../trip/types";

import type { Mutation } from "./types";

/**
 * The room's JSON back into the app's types. The room has checked every field,
 * so this only revives: ISO strings become Temporal values, codes become brands.
 */

const schedule = (s: WireSchedule): Schedule => ({
  date: Temporal.PlainDate.from(s.date),
  time: s.time === null ? null : Temporal.PlainTime.from(s.time),
  status: s.status,
});

export function reviveNote(n: WireNote): Note {
  const card = {
    id: n.id as NoteId,
    title: n.title,
    color: n.color,
    x: n.x,
    y: n.y,
    rot: n.rot,
    // a note kept on a device before cards could be resized is its own size
    scale: n.scale ?? 1,
    by: n.by as MemberId,
    updatedAt: Temporal.Instant.from(n.updatedAt),
  };
  if (n.kind === "suggestion") return { ...card, kind: "suggestion" };
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
    image: (n.image ?? null) as ImageId | null,
  };
}

export const reviveTrip = (t: WireTrip): TripSnapshot => ({
  name: t.name,
  days: t.days.map((d) => ({ date: Temporal.PlainDate.from(d.date), intro: d.intro })),
  // the room only stores codes Intl knows, so this cannot be null
  currency: currencyCode(t.currency)!,
  center: t.center,
});

export const reviveMember = (m: WireMember): Member => ({
  id: m.id as MemberId,
  // a member kept on a device before kinds were kept is a person until the room says otherwise
  kind: m.kind === "agent" ? "agent" : "person",
  name: m.name,
  color: hexColor(m.color)!,
});

const revivePatch = (p: WireMemoPatch): MemoPatch => {
  const { schedule: s, ...rest } = p;
  // the room checked an image id is one of its own
  const out = rest as MemoPatch;
  if (Object.hasOwn(p, "schedule"))
    out.schedule = s === null || s === undefined ? null : schedule(s);
  return out;
};

/** A mutation from another member, as the app's `Mutation`; `by` and the stamp travel beside it */
export function reviveMutation(m: WireMutation): Mutation {
  switch (m.type) {
    case "note:add":
      return { type: "note:add", note: reviveNote(m.note) as Memo };
    case "note:update":
      return { type: "note:update", id: m.id as NoteId, patch: revivePatch(m.patch) };
    case "note:recolor":
      return { type: "note:recolor", id: m.id as NoteId, color: m.color };
    case "note:adopt":
      return { type: "note:adopt", id: m.id as NoteId };
    case "note:move":
      return {
        type: "note:move",
        id: m.id as NoteId,
        x: m.x,
        y: m.y,
        ...(m.rot === undefined ? {} : { rot: m.rot }),
        ...(m.scale === undefined ? {} : { scale: m.scale }),
      };
    case "note:delete":
      return { type: "note:delete", id: m.id as NoteId };
    case "day:intro":
      return { type: "day:intro", date: Temporal.PlainDate.from(m.date), intro: m.intro };
    case "member:profile":
      return { type: "member:profile", name: m.name, color: hexColor(m.color)! };
  }
}
