import { Temporal } from "temporal-polyfill-lite";

import { hc, type ClientResponse } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import { hexColor } from "../../../contract/color";
import { roomId, type RoomId } from "../../../contract/ids";
import { isRecord } from "../../../contract/record";

import { toWire } from "./newRoom";
import type { DeletedRoom, Mine, NewRoom, Profile, RoomSummary } from "./types";

/** The Worker's API; every call says JSON, as the Worker's gate wants, even one with no body */
const { api } = hc<Api>("/", { headers: { "Content-Type": "application/json" } });

/** The answer's JSON as a record, its fields still to check; a response that is not 2xx is an error the caller's state can hold */
async function json(res: ClientResponse<unknown>): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return record(await res.json());
}

const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
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
    // a Worker from before says nothing: not the owner, so the list offers leaving at most
    owner: r.owner === true,
  };
}

/** How long the room keeps a deleted trip (worker/room.ts, DELETE_AFTER) */
export const KEPT_DAYS = 30;

/** One deleted trip of `/api/me`, or null without a room id, a name or when it was deleted */
export function deletedOf(raw: unknown): DeletedRoom | null {
  const r = record(raw);
  const id = roomId(r.id);
  if (id === null || typeof r.name !== "string" || typeof r.deletedAt !== "string") return null;
  try {
    const at = Temporal.Instant.from(r.deletedAt).toZonedDateTimeISO(Temporal.Now.timeZoneId());
    return { id, name: r.name, until: at.toPlainDate().add({ days: KEPT_DAYS }) };
  } catch {
    return null;
  }
}

const list = <T>(value: unknown, of: (raw: unknown) => T | null): T[] =>
  (Array.isArray(value) ? value : []).flatMap((r: unknown) => of(r) ?? []);

/**
 * What the signed-in person has: their rooms, the invitations waiting for them and the trips
 * they deleted; an entry that is not one is left out, and a Worker from before invitations
 * answers with none of the other two.
 */
export async function listMine(): Promise<Mine> {
  const r = await json(await api.me.$post());
  return {
    rooms: list(r.rooms, summaryOf),
    invitations: list(r.invitations, summaryOf),
    deleted: list(r.deleted, deletedOf),
  };
}

/** A call to the API whose answer is only whether it went */
async function call(request: Promise<ClientResponse<unknown>>): Promise<void> {
  const res = await request;
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
}

/** Into a trip one is invited to, as `me`; resolves once one is a member */
export const acceptInvitation = ({ room, me }: { room: RoomId; me: Profile }) =>
  call(api.invitations[":roomId"].accept.$post({ param: { roomId: room }, json: me }));
/** Not going: the invitation is gone, and its seat is the owner's again */
export const declineInvitation = (room: RoomId) =>
  call(api.invitations[":roomId"].decline.$post({ param: { roomId: room } }));
/** A deleted trip back, for everyone who was in it */
export const restoreRoom = (room: RoomId) =>
  call(api.rooms[":roomId"].restore.$post({ param: { roomId: room } }));
/** A deleted trip gone for good now, by its owner; nobody can restore it after */
export const purgeRoom = (room: RoomId) =>
  call(api.rooms[":roomId"].purge.$post({ param: { roomId: room } }));

/** Creates a room with its trip and its first member; resolves with the new room's id */
export async function createRoom(room: NewRoom): Promise<RoomId> {
  const id = roomId((await json(await api.rooms.$post({ json: toWire(room) }))).roomId);
  if (id === null) throw new Error("/api/rooms answered without a room id");
  return id;
}
