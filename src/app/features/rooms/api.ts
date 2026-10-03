import type { NewRoom, RoomSummary } from "./types";

const headers = { "Content-Type": "application/json" };

/** A response that is not 2xx, as an error the caller's state can hold */
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** The rooms the signed-in person is a member of */
export async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch("/api/me", { method: "POST", headers, body: "{}" });
  return (await json<{ rooms: RoomSummary[] }>(res)).rooms;
}

/** Creates a room with its trip and its first member; resolves with the new room's id */
export async function createRoom(room: NewRoom): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST", headers, body: JSON.stringify(room) });
  return (await json<{ roomId: string }>(res)).roomId;
}
