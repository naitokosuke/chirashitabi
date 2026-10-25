import { Temporal } from "temporal-polyfill-lite";

import { hc, type InferResponseType } from "hono/client";
import * as v from "valibot";

import type { Api } from "../../../../.worker-types/worker";
import { HexColorSchema, listOf, type Result } from "../../../contract";
import { KEPT_DAYS } from "../../../contract/room";
import { IsoDateSchema } from "../../../contract/wire";
import { EmailSchema, type Email } from "../members/types";
import { DONE, refused, type Refusal } from "../worker/api";

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

/** `/api/me` as the Worker answers it */
type MeAnswer = InferResponseType<typeof api.me.$post, 200>;

// how many days a deleted trip is kept, as the app takes it from the contract
export { KEPT_DAYS };

/** The last day a trip deleted at `deletedAt` (an instant) can be restored, on this device's calendar */
const untilOf = (deletedAt: string) =>
  Temporal.Instant.from(deletedAt)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate()
    .add({ days: KEPT_DAYS });

/** A room of `/api/me` as the list shows it: its first day as a date */
const summaryFrom = (s: MeAnswer["rooms"][number]): RoomSummary =>
  s.first === null
    ? { ...s, first: null, days: 0 }
    : { ...s, first: Temporal.PlainDate.from(s.first) };

/** What the signed-in person has, as the Worker answers it, with its dates as dates */
const mineFrom = ({ email, rooms, invitations, deleted }: MeAnswer): Mine & { email: Email } => ({
  email,
  rooms: rooms.map(summaryFrom),
  invitations: invitations.map(summaryFrom),
  deleted: deleted.map(({ id, name, deletedAt }) => ({ id, name, until: untilOf(deletedAt) })),
});

const count = v.fallback(v.pipe(v.number(), v.integer(), v.minValue(0)), 0);

/**
 * One entry of the list as this device kept it: a room id and a name. What the glance adds
 * (days, members, memos) is taken where it is sound and left empty where it is not: a trip
 * with an odd field still opens.
 */
const RoomSummarySchema = v.pipe(
  v.object({
    id: RoomIdSchema,
    name: v.string(),
    members: listOf(
      v.object({ kind: v.picklist(["person", "agent"]), name: v.string(), color: HexColorSchema }),
    ),
    memos: count,
    // a list kept from a Worker from before says nothing: not the owner, so the list offers leaving at most
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

/** One entry of the kept list, or null without a room id or a name */
export function summaryOf(raw: unknown): RoomSummary | null {
  const summary = v.safeParse(RoomSummarySchema, raw);
  return summary.success ? summary.output : null;
}

/** One deleted trip of the kept list: a room id, a name and when it was deleted */
const DeletedRoomSchema = v.pipe(
  v.object({ id: RoomIdSchema, name: v.string(), deletedAt: v.string() }),
  v.rawTransform(({ dataset, addIssue, NEVER }): DeletedRoom => {
    const { id, name, deletedAt } = dataset.value;
    try {
      return { id, name, until: untilOf(deletedAt) };
    } catch {
      addIssue({ message: "not an instant" });
      return NEVER;
    }
  }),
);

/** One deleted trip of the kept list, or null without a room id, a name or when it was deleted */
export function deletedOf(raw: unknown): DeletedRoom | null {
  const deleted = v.safeParse(DeletedRoomSchema, raw);
  return deleted.success ? deleted.output : null;
}

/**
 * The list as this device kept it, which may be from a Worker from before: an entry that is
 * not one is left out, a list from before invitations has none of the other two, and one from
 * before it said who is asking has no e-mail.
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

/** What the Worker answers now; a response that is not 200, or none, is an error */
export async function askMine(): Promise<Mine & { email: Email }> {
  const res = await api.me.$post();
  // the route answers only the list; Access (401) and the gate (403) answer before it
  if (res.status !== 200) throw new Error(`${res.url} answered ${String(res.status)}`);
  const answer = await res.json();
  keepList(answer);
  return mineFrom(answer);
}

/**
 * A response that is not 200 is an error the caller's state can hold; when the Worker cannot be
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

function keepList(answer: MeAnswer) {
  try {
    localStorage.setItem(KEPT_LIST, JSON.stringify(answer));
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

const invitation = api.invitations[":roomId"];
const room = api.rooms[":roomId"];

/** Why taking up an invitation was refused */
export type AcceptRefusal = Refusal<typeof invitation.accept.$post>;
/** Why bringing a deleted trip back, or having it gone for good, was refused */
export type ShelfRefusal = Refusal<typeof room.restore.$post | typeof room.purge.$post>;
/** Why making a trip was refused */
export type CreateRefusal = Refusal<typeof api.rooms.$post>;

// Each change below returns the Worker's refusal, which the person is told; any other answer
// that is not 200 is an error the caller's state can hold.

/** Into a trip one is invited to, as `me`; returns once one is a member */
export async function acceptInvitation({ room: roomId, me }: { room: RoomId; me: Profile }) {
  const res = await invitation.accept.$post({ param: { roomId }, json: me });
  if (res.status === 409) return refused(res);
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
/** Not going: the invitation is gone, and its seat is the owner's again */
export async function declineInvitation(roomId: RoomId): Promise<void> {
  const res = await invitation.decline.$post({ param: { roomId } });
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
}
/**
 * A deleted trip back, for everyone who was in it. One the other person brought back first
 * has nobody in it as a deleted trip, and is refused as not deleted
 */
export async function restoreRoom(roomId: RoomId) {
  const res = await room.restore.$post({ param: { roomId } });
  if (res.status === 403) return refused(res, "not deleted");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}
/** A deleted trip gone for good now, by its owner; nobody can restore it after, nor once it is back */
export async function purgeRoom(roomId: RoomId) {
  const res = await room.purge.$post({ param: { roomId } });
  if (res.status === 403) return refused(res, "not deleted");
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return DONE;
}

/** Creates a room with its trip and its first member; returns the new room's id */
export async function createRoom(trip: NewRoom): Promise<Result<RoomId, CreateRefusal>> {
  const res = await api.rooms.$post({ json: toWire(trip) });
  if (res.status === 409) return refused(res);
  if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  return { ok: true, value: (await res.json()).roomId };
}
