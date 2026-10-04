import type { RoomId } from "../rooms/types";

import type { MemberId, People } from "./types";

const headers = { "Content-Type": "application/json" };

/** A POST to a room's API; a response that is not 2xx is an error the caller's state can hold */
async function post(room: RoomId, action: string, body: unknown = {}): Promise<Response> {
  const res = await fetch(`/api/rooms/${room}/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return res;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** `/people` as the app holds it; what is not sound is left empty, never guessed */
export function peopleOf(raw: unknown): People {
  const r = record(raw);
  return {
    owner: typeof r.owner === "string" && r.owner !== "" ? (r.owner as MemberId) : null,
    invited: Array.isArray(r.invited)
      ? r.invited.filter((e): e is string => typeof e === "string")
      : [],
    seats: typeof r.seats === "number" && Number.isInteger(r.seats) && r.seats > 0 ? r.seats : 0,
  };
}

/** Who owns the room, whom the owner has invited, and how many people it holds */
export const fetchPeople = async (room: RoomId): Promise<People> =>
  peopleOf(await (await post(room, "people")).json());

export const invite = (room: RoomId, email: string) => post(room, "invite", { email });
export const uninvite = (room: RoomId, email: string) => post(room, "uninvite", { email });
export const removeMember = (room: RoomId, member: MemberId) => post(room, "remove", { member });
export const leaveRoom = (room: RoomId) => post(room, "leave");
/** Deleted for everyone; its owner can restore it from the list of trips for a while */
export const deleteRoom = (room: RoomId) => post(room, "delete");
