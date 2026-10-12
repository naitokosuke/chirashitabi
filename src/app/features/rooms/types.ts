import type { Temporal } from "temporal-polyfill-lite";

import type { Brand } from "../../shared/brand";
import type { HexColor } from "../../shared/color";
import type { CurrencyCode } from "../../shared/money";

import type { LatLng } from "../place/types";

/** A room's id, as the Worker mints it: a UUID */
export type RoomId = Brand<string, "RoomId">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id, or null when it is not one the Worker could have made */
export const roomId = (value: unknown): RoomId | null =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is minted here
  typeof value === "string" && UUID.test(value) ? (value as RoomId) : null;

/**
 * A room as the list of a person's trips shows it: the trip at a glance. `first` is null while
 * the trip has no days; the members are the people first, then the agent.
 */
export interface RoomSummary {
  id: RoomId;
  name: string;
  first: Temporal.PlainDate | null;
  days: number;
  members: { kind: "person" | "agent"; name: string; color: HexColor }[];
  memos: number;
  /** This person made the trip, and so may delete it; anyone else may leave it */
  owner: boolean;
}

/** A trip its owner deleted, which either person in it can restore until `until` (the room's own count of days) */
export interface DeletedRoom {
  id: RoomId;
  name: string;
  until: Temporal.PlainDate;
}

/**
 * What the signed-in person has: the trips they are in, the ones they are invited to (each
 * with its owner leading its members) and the deleted ones they can still restore.
 */
export interface Mine {
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
export interface Profile {
  name: string;
  color: HexColor;
}
