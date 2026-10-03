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
  typeof value === "string" && UUID.test(value) ? (value as RoomId) : null;

/** A room as the list of a person's trips shows it */
export interface RoomSummary {
  id: RoomId;
  name: string;
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
  me: { name: string; color: HexColor };
}
