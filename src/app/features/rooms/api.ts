import { Temporal } from "temporal-polyfill-lite";

import { hc, type ClientResponse } from "hono/client";
import * as v from "valibot";

import { HexColorSchema } from "../../shared/color";
import { listOf } from "../../shared/list";

import type { Api } from "../../../../.worker-types/worker";
import { IsoDateSchema } from "../../../contract/wire";
import { EmailSchema } from "../members/types";

import { toWire } from "./newRoom";
import {
  RoomIdSchema,
  type DeletedRoom,
  type Mine,
  type NewRoom,
  type Profile,
  type RoomId,
  type RoomSummary,
} from "./types";

/** The Worker's API; every call says JSON, as the Worker's gate wants, even one with no body */
const { api } = hc<Api>("/", { headers: { "Content-Type": "application/json" } });

const count = v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0)), 0);

/**
 * One entry of `/api/me` as the list shows it: a room id and a name. What the glance adds (days,
 * members, memos) is taken where it is sound and left empty where it is not: a trip with an odd
 * field still opens.
 */
const RoomSummarySchema = v.pipe(
  v.object({
    id: RoomIdSchema,
    name: v.string(),
    members: listOf(
      v.object({ kind: v.picklist(["person", "agent"]), name: v.string(), color: HexColorSchema }),
    ),
    memos: count,
    // a Worker from before says nothing: not the owner, so the list offers leaving at most
    owner: v.fallback(v.boolean(), false),
    first: v.fallback(
      v.nullable(
        v.pipe(
          IsoDateSchema,
          v.transform((d) => Temporal.PlainDate.from(d)),
        ),
      ),
      null,
    ),
    days: count,
  }),
  // a trip with no first day has no days to count
  v.transform(({ first, days, ...glance }): RoomSummary =>
    first === null ? { ...glance, first, days: 0 } : { ...glance, first, days },
  ),
);

/** One entry of `/api/me` as the list shows it, or null without a room id or a name */
export function summaryOf(raw: unknown): RoomSummary | null {
  const summary = v.safeParse(RoomSummarySchema, raw);
  return summary.success ? summary.output : null;
}

/** How long the room keeps a deleted trip (src/worker/room.ts, DELETE_AFTER) */
export const KEPT_DAYS = 30;

/** One deleted trip of `/api/me`: a room id, a name and when it was deleted */
const DeletedRoomSchema = v.pipe(
  v.object({ id: RoomIdSchema, name: v.string(), deletedAt: v.string() }),
  v.rawTransform(({ dataset, addIssue, NEVER }): DeletedRoom => {
    const { id, name, deletedAt } = dataset.value;
    try {
      const at = Temporal.Instant.from(deletedAt).toZonedDateTimeISO(Temporal.Now.timeZoneId());
      return { id, name, until: at.toPlainDate().add({ days: KEPT_DAYS }) };
    } catch {
      addIssue({ message: "not an instant" });
      return NEVER;
    }
  }),
);

/** One deleted trip of `/api/me`, or null without a room id, a name or when it was deleted */
export function deletedOf(raw: unknown): DeletedRoom | null {
  const deleted = v.safeParse(DeletedRoomSchema, raw);
  return deleted.success ? deleted.output : null;
}

/**
 * What the signed-in person has: their rooms, the invitations waiting for them and the trips
 * they deleted, and who they are; an entry that is not one is left out, and a Worker from
 * before invitations answers with none of the other two.
 */
const MineSchema = v.fallback(
  v.object({
    email: v.fallback(v.nullable(EmailSchema), null),
    rooms: listOf(RoomSummarySchema),
    invitations: listOf(RoomSummarySchema),
    deleted: listOf(DeletedRoomSchema),
  }),
  { email: null, rooms: [], invitations: [], deleted: [] },
);

/** The list as the Worker last answered it, kept so the trips still show when it cannot be asked */
const KEPT_LIST = "chirashitabi:me";

/** What the Worker answers now; a response that is not 2xx, or none, is an error */
export async function askMine(): Promise<Mine> {
  const res = await api.me.$post();
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  const raw: unknown = await res.json();
  keepList(raw);
  return v.parse(MineSchema, raw);
}

/**
 * A response that is not 2xx is an error the caller's state can hold; when the Worker cannot be
 * reached at all (cut off), the list as it was last answered stands in, if this device kept it
 */
export async function listMine(): Promise<Mine> {
  try {
    return await askMine();
  } catch (e) {
    const kept = keptList();
    if (kept === null) throw e;
    return v.parse(MineSchema, kept);
  }
}

function keepList(raw: unknown) {
  try {
    localStorage.setItem(KEPT_LIST, JSON.stringify(raw));
  } catch {
    // nothing kept this time; the list still shows
  }
}

/** The kept answer, or null: never kept, or not JSON */
function keptList(): unknown {
  try {
    const raw = localStorage.getItem(KEPT_LIST);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
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
  const res = await api.rooms.$post({ json: toWire(room) });
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  const answer = v.safeParse(v.object({ roomId: RoomIdSchema }), await res.json());
  if (!answer.success) throw new Error("/api/rooms answered without a room id");
  return answer.output.roomId;
}
