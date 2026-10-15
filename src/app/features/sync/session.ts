import type { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";

/** How the socket to the chosen room is doing (socket.ts) */
export type Link = "connecting" | "connected" | "reconnecting" | "failed";

/**
 * Where this device is. It is in a room only once it knows who it is there and has the room as
 * of some moment, from the room's snapshot or as this device kept it; only then can the room
 * be shown or changed. Before that it is joining, with nothing of the room to show.
 */
export type Session =
  | { kind: "out" }
  | { kind: "joining"; room: RoomId; link: Link }
  | { kind: "in"; room: RoomId; me: MemberId; syncedAt: Temporal.Instant; link: Link };

export type InRoom = Extract<Session, { kind: "in" }>;

export const OUT: Session = { kind: "out" };

/** Opening a room: in at once with what this device kept of it, joining otherwise */
export const opened = (
  room: RoomId,
  kept: { me: MemberId; savedAt: Temporal.Instant } | null,
): Session =>
  kept === null
    ? { kind: "joining", room, link: "connecting" }
    : { kind: "in", room, me: kept.me, syncedAt: kept.savedAt, link: "connecting" };

/** The room's state arrived whole at `at`, and says who this device is */
export const synced = (s: Session, me: MemberId, at: Temporal.Instant): Session =>
  s.kind === "out" ? s : { kind: "in", room: s.room, me, syncedAt: at, link: "connected" };

/** The socket's status changed; out of a room there is no socket to speak of */
export const linked = (s: Session, link: Link): Session =>
  s.kind === "out" || s.link === link ? s : { ...s, link };

/** The room whose cache entries the stores read; out of a room, none */
export const roomOf = (s: Session): RoomId | null => (s.kind === "out" ? null : s.room);
