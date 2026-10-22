import type { Temporal } from "temporal-polyfill-lite";

import type * as v from "valibot";

import type { HexColor } from "../../shared/color";
import type { CurrencyCode } from "../../shared/money";

import type { RoomId } from "../../../contract/room";
import type { ProfileSchema } from "../../../contract/wire";
import type { Email } from "../members/types";
import type { LatLng } from "../place/types";

// a room's id, as the app takes it from the contract
export { parseRoomId, RoomIdSchema, type RoomId } from "../../../contract/room";

/**
 * A room as the list of a person's trips shows it: the trip at a glance. `first` is null while
 * the trip has no days; the members are the people first, then the agent.
 */
export type RoomSummary = {
  id: RoomId;
  name: string;
  members: { kind: "person" | "agent"; name: string; color: HexColor }[];
  memos: number;
  /** This person made the trip, and so may delete it; anyone else may leave it */
  owner: boolean;
} & ({ first: null; days: 0 } | { first: Temporal.PlainDate; days: number });

/** A trip its owner deleted, which either person in it can restore until `until` (the room's own count of days) */
export interface DeletedRoom {
  id: RoomId;
  name: string;
  until: Temporal.PlainDate;
}

/**
 * What the signed-in person has: the trips they are in, the ones they are invited to (each
 * with its owner leading its members) and the deleted ones they can still restore. `email` is
 * who they are, null from a Worker from before it said so.
 */
export interface Mine {
  email: Email | null;
  rooms: RoomSummary[];
  invitations: RoomSummary[];
  deleted: DeletedRoom[];
}

/**
 * A trip as it is started, checked (newRoom.ts): a name, `days` days in a row from `first`
 * (at least one), a currency this runtime can format; and its first member, named, in a color
 * that can go into a style.
 */
export interface NewRoom {
  trip: {
    name: string;
    first: Temporal.PlainDate;
    days: number;
    currency: CurrencyCode;
    center: LatLng;
  };
  me: Profile;
}

/** How a person is shown in a room: a color that can go into a style, and a name (blank for now: people are told apart by color alone) */
export type Profile = v.InferOutput<typeof ProfileSchema>;
