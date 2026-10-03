import { Temporal } from "temporal-polyfill-lite";

import { hexColor } from "../../shared/color";

import { toWire } from "./newRoom";
import { roomId, type NewRoom, type RoomId, type RoomSummary } from "./types";

const headers = { "Content-Type": "application/json" };

/** A response that is not 2xx, as an error the caller's state can hold */
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return (await res.json()) as T;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const count = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
function date(value: unknown): Temporal.PlainDate | null {
  if (typeof value !== "string") return null;
  try {
    return Temporal.PlainDate.from(value);
  } catch {
    return null;
  }
}

/**
 * One entry of `/api/me` as the list shows it, or null without a room id or a name. What the
 * glance adds (days, members, memos) is taken where it is sound and left empty where it is not:
 * a trip with an odd field still opens.
 */
export function summaryOf(raw: unknown): RoomSummary | null {
  const r = record(raw);
  const id = roomId(r.id);
  if (id === null || typeof r.name !== "string") return null;
  const members = (Array.isArray(r.members) ? r.members : []).flatMap((m: unknown) => {
    const { kind, name, color } = record(m);
    const hex = typeof color === "string" ? hexColor(color) : null;
    if ((kind !== "person" && kind !== "agent") || typeof name !== "string" || hex === null)
      return [];
    return [{ kind, name, color: hex } as const];
  });
  return {
    id,
    name: r.name,
    first: date(r.first),
    days: count(r.days),
    members,
    memos: count(r.memos),
  };
}

/** The rooms the signed-in person is a member of; an entry that is not a room is left out */
export async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch("/api/me", { method: "POST", headers, body: "{}" });
  const { rooms } = await json<{ rooms: unknown[] }>(res);
  return rooms.flatMap((r) => summaryOf(r) ?? []);
}

/** Creates a room with its trip and its first member; resolves with the new room's id */
export async function createRoom(room: NewRoom): Promise<RoomId> {
  const body = JSON.stringify(toWire(room));
  const res = await fetch("/api/rooms", { method: "POST", headers, body });
  const id = roomId((await json<{ roomId: unknown }>(res)).roomId);
  if (id === null) throw new Error("/api/rooms answered without a room id");
  return id;
}
