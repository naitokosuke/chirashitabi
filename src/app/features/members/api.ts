import { hc } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import type { RoomId } from "../rooms/types";

import type { Email, MemberId } from "./types";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/**
 * A call to a room's API whose answer is only whether it went; a response that is not 200 is an
 * error the caller's state can hold
 */
async function call(request: Promise<{ status: number; url: string }>): Promise<void> {
  const res = await request;
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
}

/** Whom the owner has invited and is waiting on; the room answers its owner only */
export async function fetchInvited(roomId: RoomId): Promise<Email[]> {
  const res = await inRoom.invited.$post({ param: { roomId } });
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return (await res.json()).invited;
}

export const invite = (roomId: RoomId, email: Email) =>
  call(inRoom.invite.$post({ param: { roomId }, json: { email } }));
export const uninvite = (roomId: RoomId, email: Email) =>
  call(inRoom.uninvite.$post({ param: { roomId }, json: { email } }));
export const removeMember = (roomId: RoomId, member: MemberId) =>
  call(inRoom.remove.$post({ param: { roomId }, json: { member } }));
export const leaveRoom = (roomId: RoomId) => call(inRoom.leave.$post({ param: { roomId } }));
/** Deleted for everyone; its owner can restore it from the list of trips for a while */
export const deleteRoom = (roomId: RoomId) => call(inRoom.delete.$post({ param: { roomId } }));
