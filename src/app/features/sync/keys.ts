/** The parts of a room that are cached on their own (docs/data-fetching.md) */
export type RoomSlice = "notes" | "trip" | "members";

/**
 * A room slice's cache key. A session without a room (the mocks, the single-file build)
 * keeps its data under "local".
 */
export const roomKey = (roomId: string | null, slice: RoomSlice) =>
  ["room", roomId ?? "local", slice] as const;
