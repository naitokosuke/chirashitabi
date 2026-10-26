import type { Temporal } from "temporal-polyfill-lite";

import type * as v from "valibot";

import type { CurrencyCode } from "../../../contract";
import type { RoomId } from "../../../contract/room";
import type { ProfileSchema, WireListedRoom } from "../../../contract/wire";
import type { Email } from "../members/types";
import type { LatLng } from "../place/types";

// a room's id, as the app takes it from the contract
export { parseRoomId, RoomIdSchema, type RoomId } from "../../../contract/room";

/**
 * A room as the list of a person's trips shows it: the trip at a glance, as `/api/me` lists it
 * (the contract), its first day as a date. The members are the people first, then the agent;
 * `owner` says this person made the trip, and so may delete it, where anyone else may leave it.
 */
export type RoomSummary = {
  [K in keyof WireListedRoom]: K extends "first" ? Temporal.PlainDate : WireListedRoom[K];
};

/** A trip its owner deleted, which either person in it can restore until `until` (the room's own count of days) */
export interface DeletedRoom {
  id: RoomId;
  name: string;
  until: Temporal.PlainDate;
}

/**
 * What the signed-in person has: the trips they are in, the ones they are invited to (each
 * with its owner leading its members) and the deleted ones they can still restore. `email` is
 * who they are, null in a list this device kept from a Worker from before it said so.
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
