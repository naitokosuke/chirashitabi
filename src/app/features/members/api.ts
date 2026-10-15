import { hc, type ClientResponse } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import type { RoomId, MemberId } from "../../../contract/ids";
import { isRecord } from "../../../contract/record";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/** A call to a room's API; a response that is not 2xx is an error the caller's state can hold */
async function call<R extends ClientResponse<unknown>>(request: Promise<R>): Promise<R> {
  const res = await request;
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return res;
}

/** `/invited` as the app holds it: the e-mails, and nothing that is not one */
export function invitedOf(raw: unknown): string[] {
  const list = isRecord(raw) ? raw.invited : null;
  return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string") : [];
}

/** Whom the owner has invited and is waiting on; the room answers its owner only */
export const fetchInvited = async (roomId: RoomId): Promise<string[]> =>
  invitedOf(await (await call(inRoom.invited.$post({ param: { roomId } }))).json());

export const invite = (roomId: RoomId, email: string) =>
  call(inRoom.invite.$post({ param: { roomId }, json: { email } }));
export const uninvite = (roomId: RoomId, email: string) =>
  call(inRoom.uninvite.$post({ param: { roomId }, json: { email } }));
export const removeMember = (roomId: RoomId, member: MemberId) =>
  call(inRoom.remove.$post({ param: { roomId }, json: { member } }));
export const leaveRoom = (roomId: RoomId) => call(inRoom.leave.$post({ param: { roomId } }));
/** Deleted for everyone; its owner can restore it from the list of trips for a while */
export const deleteRoom = (roomId: RoomId) => call(inRoom.delete.$post({ param: { roomId } }));
