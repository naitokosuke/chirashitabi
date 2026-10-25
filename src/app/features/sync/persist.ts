import { Temporal } from "temporal-polyfill-lite";

import * as v from "valibot";

import { listOf } from "../../../contract";
import { MemberIdSchema, type Email, type MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";

import type { Pending, RoomState } from "./ledger";
import {
  CidSchema,
  IsoInstantSchema,
  WireMemberSchema,
  WireMutationSchema,
  WireNoteSchema,
  WireTripSchema,
  reviveMutation,
  reviveNote,
  reviveTrip,
} from "./wire";

/**
 * A room kept on this device, so the booklet opens with no connection on the trip
 * (docs/data-fetching.md): what the room last confirmed and our changes it had not answered,
 * which are sent once the room is back. Stored as the JSON the wire uses (Temporal values
 * write themselves as ISO strings) and revived with the wire's own functions. What is kept is
 * the signed-in person's (claim): another person on this browser finds none of it.
 */

/** 2: who this device is (`me`) is kept too */
const VERSION = 2;
const PREFIX = "chirashitabi:room:";
const keyOf = (roomId: RoomId) => `${PREFIX}${roomId}`;
/** Whose the kept rooms are, as `/api/me` names the signed-in person */
const OWNER_KEY = "chirashitabi:owner";

/** Which version wrote a save, whatever else it holds */
const VersionSchema = v.pipe(v.string(), v.parseJson(), v.object({ v: v.number() }));

/**
 * What keep() writes, read back as the room's own messages are: a note, a member or a change
 * that does not read is left out, and the rest is kept; without who this device is, or as of
 * when, it is none
 */
const SavedSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    v: v.number(),
    savedAt: IsoInstantSchema,
    me: MemberIdSchema,
    confirmed: v.object({
      notes: listOf(WireNoteSchema),
      trip: v.fallback(v.nullable(WireTripSchema), null),
      members: listOf(WireMemberSchema),
    }),
    /** `by` since this device signed each one; kept before that, they are all `me`'s */
    pending: listOf(
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

/** The keys of every room kept on this device */
function keptKeys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? "").filter((k) =>
    k.startsWith(PREFIX),
  );
}

/** Whether a save is a newer version's: that version's to read and to write */
function newer(raw: string | null): boolean {
  if (raw === null) return false;
  const read = v.safeParse(VersionSchema, raw);
  return read.success && read.output.v > VERSION;
}

/**
 * Keeps the room, unless a newer version of the app kept it. A full storage makes room by
 * letting the other rooms go; still full, or blocked, nothing of this room stays either, since
 * an older save would bring back changes the room has answered since.
 */
export function keep(storage: Storage, roomId: RoomId, room: Kept) {
  const key = keyOf(roomId);
  const saved = JSON.stringify({ v: VERSION, ...room });
  try {
    if (newer(storage.getItem(key))) return;
    storage.setItem(key, saved);
    return;
  } catch {
    // full, most likely: the other rooms go first
  }
  try {
    for (const k of keptKeys(storage)) if (k !== key) storage.removeItem(k);
    storage.setItem(key, saved);
  } catch {
    forget(storage, roomId);
  }
}

/** Nothing of the room is kept any more: this device's person is out of it, or it was deleted */
export function forget(storage: Storage, roomId: RoomId) {
  try {
    storage.removeItem(keyOf(roomId));
  } catch {
    // still kept; the room refuses this device when it is opened again
  }
}

/** The room as it was kept, or null: never kept, a newer version's, without who this device is, or unreadable */
export function kept(storage: Storage, roomId: RoomId): Kept | null {
  try {
    const raw = storage.getItem(keyOf(roomId));
    if (raw === null) return null;
    const read = v.safeParse(SavedSchema, raw);
    if (!read.success || read.output.v > VERSION) return null;
    const saved = read.output;
    return {
      me: saved.me,
      confirmed: {
        notes: saved.confirmed.notes.map(reviveNote),
        trip: saved.confirmed.trip === null ? null : reviveTrip(saved.confirmed.trip),
        members: saved.confirmed.members,
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

/**
 * What is kept from now on is `email`'s. When the kept rooms were someone else's, every one of
 * them goes, and this says so. Rooms kept before anyone was named are taken as `email`'s.
 */
export function claim(storage: Storage, email: Email): boolean {
  try {
    const owner = storage.getItem(OWNER_KEY);
    const someoneElse = owner !== null && owner !== email;
    if (someoneElse) for (const k of keptKeys(storage)) storage.removeItem(k);
    storage.setItem(OWNER_KEY, email);
    return someoneElse;
  } catch {
    return false;
  }
}

/** Lets go of every kept room but `rooms`, the ones the person is in */
export function prune(storage: Storage, rooms: readonly RoomId[]) {
  const still = new Set(rooms.map(keyOf));
  try {
    for (const k of keptKeys(storage)) if (!still.has(k)) storage.removeItem(k);
  } catch {
    // still kept; each goes once its room refuses this device
  }
}
