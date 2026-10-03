import { roomId, type NewRoom, type RoomId, type RoomSummary } from "./types";

const headers = { "Content-Type": "application/json" };

/** A response that is not 2xx, as an error the caller's state can hold */
async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return (await res.json()) as T;
}

/** The rooms the signed-in person is a member of; an entry without a room id is left out */
export async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch("/api/me", { method: "POST", headers, body: "{}" });
  const { rooms } = await json<{ rooms: { id: unknown; name: string }[] }>(res);
  return rooms.flatMap((r) => {
    const id = roomId(r.id);
    return id === null ? [] : [{ id, name: r.name }];
  });
}

/** Creates a room with its trip and its first member; resolves with the new room's id */
export async function createRoom(room: NewRoom): Promise<RoomId> {
  const res = await fetch("/api/rooms", { method: "POST", headers, body: JSON.stringify(room) });
  const id = roomId((await json<{ roomId: unknown }>(res)).roomId);
  if (id === null) throw new Error("/api/rooms answered without a room id");
  return id;
}
