import type { Brand } from "../../shared/brand";

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

/** What a room is created with; the Worker checks it again */
export interface NewRoom {
  trip: { name: string; days: string[]; currency: string; center: { lat: number; lng: number } };
  me: { name: string; color: string };
}
