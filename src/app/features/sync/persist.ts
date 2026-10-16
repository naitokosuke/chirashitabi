import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { MemberIdSchema, type MemberId } from "../members/types";

import type { Pending, RoomState } from "./ledger";
import {
  CidSchema,
  IsoInstantSchema,
  WireMemberSchema,
  WireMutationSchema,
  WireNoteSchema,
  WireTripSchema,
  reviveMember,
  reviveMutation,
  reviveNote,
  reviveTrip,
} from "./wire";

/**
 * A room kept on this device, so the booklet opens with no connection on the trip
 * (docs/data-fetching.md): what the room last confirmed and our changes it had not answered,
 * which are sent once the room is back. Stored as the JSON the wire uses (Temporal values
 * write themselves as ISO strings) and revived with the wire's own functions.
 */

/** 2: who this device is (`me`) is kept too */
const VERSION = 2;
const keyOf = (roomId: string) => `chirashitabi:room:${roomId}`;

/**
 * What keep() writes, read back as the room's own messages are: one from another version, or
 * that is not what keep() wrote at all, is none
 */
const SavedSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    v: v.literal(VERSION),
    savedAt: IsoInstantSchema,
    me: MemberIdSchema,
    confirmed: v.object({
      notes: v.array(WireNoteSchema),
      trip: v.nullable(WireTripSchema),
      members: v.array(WireMemberSchema),
    }),
    /** `by` since this device signed each one; kept before that, they are all `me`'s */
    pending: v.array(
      v.object({
        cid: CidSchema,
        m: WireMutationSchema,
        at: IsoInstantSchema,
        by: v.optional(MemberIdSchema),
      }),
    ),
  }),
);

/** A room as this device kept it; `me` is who this device is in it, so offline notes are signed */
export interface Kept {
  me: MemberId;
  confirmed: RoomState;
  pending: Pending[];
  savedAt: Temporal.Instant;
}

/** Keeps the room; a full or blocked storage keeps nothing, and the room still works */
export function keep(storage: Storage, roomId: string, room: Kept) {
  const saved = { v: VERSION, ...room };
  try {
    storage.setItem(keyOf(roomId), JSON.stringify(saved));
  } catch {
    // nothing kept this time
  }
}

/** Nothing of the room is kept any more: this device's person is out of it, or it was deleted */
export function forget(storage: Storage, roomId: string) {
  try {
    storage.removeItem(keyOf(roomId));
  } catch {
    // still kept; the room refuses this device when it is opened again
  }
}

/** The room as it was kept, or null: never kept, from another version, without who this device is, or unreadable */
export function kept(storage: Storage, roomId: string): Kept | null {
  try {
    const raw = storage.getItem(keyOf(roomId));
    if (raw === null) return null;
    const read = v.safeParse(SavedSchema, raw);
    if (!read.success) return null;
    const saved = read.output;
    return {
      me: saved.me,
      confirmed: {
        notes: saved.confirmed.notes.map(reviveNote),
        trip: saved.confirmed.trip === null ? null : reviveTrip(saved.confirmed.trip),
        members: saved.confirmed.members.map(reviveMember),
      },
      pending: saved.pending.map((p) => ({
        cid: p.cid,
        m: reviveMutation(p.m),
        at: Temporal.Instant.from(p.at),
        by: p.by ?? saved.me,
      })),
      savedAt: Temporal.Instant.from(saved.savedAt),
    };
  } catch {
    return null;
  }
}
