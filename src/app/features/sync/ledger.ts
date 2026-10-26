import type { Temporal } from "temporal-polyfill-lite";

import { applyToMembers } from "../members/apply";
import type { Member, MemberId } from "../members/types";
import { applyToNotes } from "../notes/apply";
import type { Note } from "../notes/types";
import { applyToTrip, moveSchedules } from "../trip/apply";
import type { TripSnapshot } from "../trip/types";

import type { Mutation } from "./types";
import type { Cid } from "./wire";

/** Everything a room shows: what the cache's three slices hold (keys.ts) */
export interface RoomState {
  notes: Note[];
  trip: TripSnapshot;
  members: Member[];
}

/** One of ours the room has not answered yet, signed by who made it; `cid` is how its answer names it */
export interface Pending {
  cid: Cid;
  m: Mutation;
  at: Temporal.Instant;
  by: MemberId;
}

/** A room after one mutation; a slice that does not change keeps its identity */
export function applyToRoom(
  s: RoomState,
  m: Mutation,
  by: MemberId,
  at: Temporal.Instant,
): RoomState {
  // the trip's dates move what is planned on them too, by how far its first day moved
  const notes =
    m.type === "trip:dates"
      ? moveSchedules(s.notes, s.trip.days[0]?.date, m, at)
      : applyToNotes(s.notes, m, by, at);
  const members = applyToMembers(s.members, m, by);
  const trip = applyToTrip(s.trip, m);
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
 *
 * Until the room's state is had, from the room or as this device kept it, there is nothing to
 * show (null), and nothing to apply a change to: none is made then (session.ts).
 */
export function createLedger() {
  let confirmed: RoomState | null = null;
  let pending: Pending[] = [];
  /** `s` with the pending changes applied on top, in order */
  const over = (s: RoomState) => pending.reduce((v, p) => applyToRoom(v, p.m, p.by, p.at), s);
  const view = () => (confirmed === null ? null : over(confirmed));

  return {
    get pending(): readonly Pending[] {
      return pending;
    },
    get confirmed(): RoomState | null {
      return confirmed;
    },
    /** As it was kept on this device (persist.ts), before the room says anything; nothing, when it was not */
    restore(state: RoomState | null, unanswered: readonly Pending[]): RoomState | null {
      confirmed = state;
      pending = [...unanswered];
      return view();
    },
    /** The room's state arrived whole; the pending ones stay on top, to be sent again */
    snapshot(state: RoomState): RoomState {
      confirmed = state;
      return over(state);
    },
    /** Who is in the room now, as the room says after someone joined, was removed or left */
    members(members: Member[]): RoomState | null {
      if (confirmed !== null) confirmed = { ...confirmed, members };
      return view();
    },
    /** A member's change, relayed by the room */
    relayed(m: Mutation, by: MemberId, at: Temporal.Instant): RoomState | null {
      if (confirmed !== null) confirmed = applyToRoom(confirmed, m, by, at);
      return view();
    },
    /** One of ours, made by `by` (this device) and sent with `cid` */
    commit(m: Mutation, cid: Cid, at: Temporal.Instant, by: MemberId): RoomState | null {
      pending = [...pending, { cid, m, at, by }];
      return view();
    },
    /** The room applied ours at `at` */
    ack(cid: Cid, at: Temporal.Instant): RoomState | null {
      const p = pending.find((x) => x.cid === cid);
      if (p === undefined) return view();
      pending = pending.filter((x) => x !== p);
      if (confirmed !== null) confirmed = applyToRoom(confirmed, p.m, p.by, at);
      return view();
    },
    /** The room refused ours: it goes, and only it */
    reject(cid: Cid): { dropped: Pending | undefined; view: RoomState | null } {
      const dropped = pending.find((x) => x.cid === cid);
      pending = pending.filter((x) => x !== dropped);
      return { dropped, view: view() };
    },
  };
}

export type Ledger = ReturnType<typeof createLedger>;
