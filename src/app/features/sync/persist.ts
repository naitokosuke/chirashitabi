import { Temporal } from "temporal-polyfill-lite";

import type { WireMember, WireMutation, WireNote, WireTrip } from "../../../../worker/wire";
import type { MemberId } from "../members/types";

import type { Pending, RoomState } from "./ledger";
import { reviveMember, reviveMutation, reviveNote, reviveTrip } from "./wire";

/**
 * A room kept on this device, so the booklet opens with no connection on the trip
 * (docs/data-fetching.md): what the room last confirmed and our changes it had not answered,
 * which are sent once the room is back. Stored as the JSON the wire uses (Temporal values
 * write themselves as ISO strings) and revived with the wire's own functions.
 */

/** 2: who this device is (`me`) is kept too */
const VERSION = 2;
const keyOf = (roomId: string) => `chirashitabi:room:${roomId}`;

interface Saved {
  v: typeof VERSION;
  savedAt: string;
  me: string;
  confirmed: { notes: WireNote[]; trip: WireTrip | null; members: WireMember[] };
  pending: { cid: string; m: WireMutation; at: string }[];
}

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

/** The room as it was kept, or null: never kept, from another version, or unreadable */
export function kept(storage: Storage, roomId: string): Kept | null {
  try {
    const raw = storage.getItem(keyOf(roomId));
    if (raw === null) return null;
    const saved = JSON.parse(raw) as Saved;
    if (saved.v !== VERSION) return null;
    return {
      me: saved.me as MemberId,
      confirmed: {
        notes: saved.confirmed.notes.map(reviveNote),
        trip: saved.confirmed.trip === null ? null : reviveTrip(saved.confirmed.trip),
        members: saved.confirmed.members.map(reviveMember),
      },
      pending: saved.pending.map((p) => ({
        cid: p.cid,
        m: reviveMutation(p.m),
        at: Temporal.Instant.from(p.at),
      })),
      savedAt: Temporal.Instant.from(saved.savedAt),
    };
  } catch {
    return null;
  }
}
