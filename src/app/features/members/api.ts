import { hc } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import type { RoomId } from "../rooms/types";
import { DONE, refused, type Refusal } from "../worker/api";

import type { Email, MemberId } from "./types";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/** Why the room refused a change of who is in, whichever change it was */
export type MembersRefusal = Refusal<
  | typeof inRoom.invite.$post
  | typeof inRoom.uninvite.$post
  | typeof inRoom.remove.$post
  | typeof inRoom.leave.$post
  | typeof inRoom.delete.$post
>;

/** Whom the owner has invited and is waiting on; the room answers its owner only */
export async function fetchInvited(roomId: RoomId): Promise<Email[]> {
  const res = await inRoom.invited.$post({ param: { roomId } });
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return (await res.json()).invited;
}

// Each change below returns the room's refusal, which the person is told: one asked by someone
// no longer in the room as "not in". Any other answer that is not 200 is an error the caller's
// state can hold.

export async function invite(roomId: RoomId, email: Email) {
  const res = await inRoom.invite.$post({ param: { roomId }, json: { email } });
  if (res.status === 403 || res.status === 409) return refused(res, "not in");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
export async function uninvite(roomId: RoomId, email: Email) {
  const res = await inRoom.uninvite.$post({ param: { roomId }, json: { email } });
  if (res.status === 403) return refused(res, "not in");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
export async function removeMember(roomId: RoomId, member: MemberId) {
  const res = await inRoom.remove.$post({ param: { roomId }, json: { member } });
  if (res.status === 403) return refused(res, "not in");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
export async function leaveRoom(roomId: RoomId) {
  const res = await inRoom.leave.$post({ param: { roomId } });
  if (res.status === 403) return refused(res, "not in");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
/** Deleted for everyone; its owner can restore it from the list of trips for a while */
export async function deleteRoom(roomId: RoomId) {
  const res = await inRoom.delete.$post({ param: { roomId } });
  if (res.status === 403) return refused(res, "not in");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
