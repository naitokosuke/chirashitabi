import type { Temporal } from "temporal-polyfill-lite";

import { applyToMembers } from "../members/apply";
import type { Member, MemberId } from "../members/types";
import { applyToNotes } from "../notes/apply";
import type { Note } from "../notes/types";
import { applyToDays } from "../trip/apply";
import type { TripSnapshot } from "../trip/types";

import type { Mutation } from "./types";

/** Everything a room shows: what the cache's three slices hold (keys.ts) */
export interface RoomState {
  notes: Note[];
  trip: TripSnapshot | null;
  members: Member[];
}

/** One of ours the room has not answered yet; `cid` is how its answer names it */
export interface Pending {
  cid: string;
  m: Mutation;
  at: Temporal.Instant;
}

export const EMPTY_ROOM: RoomState = { notes: [], trip: null, members: [] };

/** A room after one mutation; a slice that does not change keeps its identity */
export function applyToRoom(
  s: RoomState,
  m: Mutation,
  by: MemberId,
  at: Temporal.Instant,
): RoomState {
  const notes = applyToNotes(s.notes, m, by, at);
  const members = applyToMembers(s.members, m, by);
  const days = s.trip === null ? null : applyToDays(s.trip.days, m);
  const trip =
    s.trip === null || days === null || days === s.trip.days ? s.trip : { ...s.trip, days };
  return notes === s.notes && members === s.members && trip === s.trip
    ? s
    : { notes, trip, members };
}

/**
 * What the room has confirmed, and our changes it has not answered yet (docs/data-fetching.md).
 * The screen shows `view`: the confirmed state with the pending changes applied on top, in
 * order. So a change of ours shows at once; a member's change lands under ours until the room
 * answers (ours is not overwritten by an older value); an ack moves ours into the confirmed
 * state; a rejection drops just that one, and the rest stay. After a reconnect the pending
 * ones are sent again: every mutation is safe to apply twice, and a second `note:add` or a
 * change to what is gone is rejected and dropped, which leaves what the snapshot says.
 */
export function createLedger(me: () => MemberId) {
  let confirmed: RoomState = EMPTY_ROOM;
  let pending: Pending[] = [];
  const view = () => pending.reduce((s, p) => applyToRoom(s, p.m, me(), p.at), confirmed);

  return {
    get pending(): readonly Pending[] {
      return pending;
    },
    /** The room's state arrived whole; the pending ones stay on top, to be sent again */
    snapshot(state: RoomState): RoomState {
      confirmed = state;
      return view();
    },
    /** A member's change, relayed by the room */
    relayed(m: Mutation, by: MemberId, at: Temporal.Instant): RoomState {
      confirmed = applyToRoom(confirmed, m, by, at);
      return view();
    },
    /** One of ours, sent with `cid` */
    commit(m: Mutation, cid: string, at: Temporal.Instant): RoomState {
      pending = [...pending, { cid, m, at }];
      return view();
    },
    /** The room applied ours at `at` */
    ack(cid: string, at: Temporal.Instant): RoomState {
      const p = pending.find((x) => x.cid === cid);
      if (p === undefined) return view();
      pending = pending.filter((x) => x !== p);
      confirmed = applyToRoom(confirmed, p.m, me(), at);
      return view();
    },
    /** The room refused ours: it goes, and only it */
    reject(cid: string): { dropped: Pending | undefined; view: RoomState } {
      const dropped = pending.find((x) => x.cid === cid);
      pending = pending.filter((x) => x !== dropped);
      return { dropped, view: view() };
    },
  };
}

export type Ledger = ReturnType<typeof createLedger>;
