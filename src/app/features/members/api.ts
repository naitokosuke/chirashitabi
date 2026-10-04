import type { RoomId } from "../rooms/types";

import type { MemberId } from "./types";

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

/** `/invited` as the app holds it: the e-mails, and nothing that is not one */
export function invitedOf(raw: unknown): string[] {
  const list =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).invited : null;
  return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string") : [];
}

/** Whom the owner has invited and is waiting on; the room answers its owner only */
export const fetchInvited = async (room: RoomId): Promise<string[]> =>
  invitedOf(await (await post(room, "invited")).json());

export const invite = (room: RoomId, email: string) => post(room, "invite", { email });
export const uninvite = (room: RoomId, email: string) => post(room, "uninvite", { email });
export const removeMember = (room: RoomId, member: MemberId) => post(room, "remove", { member });
export const leaveRoom = (room: RoomId) => post(room, "leave");
/** Deleted for everyone; its owner can restore it from the list of trips for a while */
export const deleteRoom = (room: RoomId) => post(room, "delete");
