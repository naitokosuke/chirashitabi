import { Temporal } from "temporal-polyfill-lite";

import { hc, type InferResponseType } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import type { Result } from "../../../contract";
import type { FoundPlace } from "../place/types";
import type { RoomId } from "../rooms/types";

import type { OverBudget, Publication, WorkerApi } from "./types";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/**
 * The refusal any room's call may answer before its route runs: the asker is not in the room,
 * or not in it as the call needs it (a deleted room, to restore it)
 */
const OUTSIDER = "not a member" satisfies InferResponseType<
  typeof inRoom.invited.$post,
  403
>["error"];

/**
 * Why the Worker refused a call (403, 409), as the call's route says: a word the person is told.
 * The room's own refusal of an outsider is told as one of these (`refused`)
 */
export type Refusal<Post> = Exclude<InferResponseType<Post, 403 | 409>["error"], typeof OUTSIDER>;

/** What a refused call answers: JSON naming the refusal */
type Refused<E> = { json(): Promise<{ error: E }> };

/**
 * A refusal as its call returns it, with the word the Worker answered; a refusal of an
 * outsider as `outside`, the word of the call's own that the person is told for it. A 403 from
 * before the room (not from the app) is plain text, not a refusal: it throws as not JSON.
 */
export function refused<E extends string>(res: Refused<E>): Promise<Result<never, E>>;
export function refused<E extends string, F extends string>(
  res: Refused<E>,
  outside: F,
): Promise<Result<never, Exclude<E, typeof OUTSIDER> | F>>;
export async function refused(
  res: Refused<string>,
  outside?: string,
): Promise<Result<never, string>> {
  const { error } = await res.json();
  return { ok: false, reason: error === OUTSIDER ? (outside ?? error) : error };
}

/** What a call whose answer is only whether it went returns when it went */
export const DONE: Result<void, never> = { ok: true, value: undefined };

/** The budget's refusal of a paid call, with the ceiling the Worker says it met */
async function over(res: {
  json(): Promise<{ ceiling: OverBudget["ceiling"] }>;
}): Promise<Result<never, OverBudget>> {
  const { ceiling } = await res.json();
  return { ok: false, reason: { kind: "over", ceiling } };
}

/** A place as the Worker sends it, its point as `lat` and `lng` beside its name */
const foundOf = ({
  name,
  address,
  lat,
  lng,
  hours,
}: InferResponseType<typeof inRoom.find.$post, 200>["places"][number]): FoundPlace => ({
  name,
  address,
  at: { lat, lng },
  hours,
});

/** The public booklet as the Worker says where it is, and as of when */
const publicationOf = ({
  url,
  at,
}: NonNullable<
  InferResponseType<typeof inRoom.publication.$post, 200>["publication"]
>): Publication => ({
  url,
  at: Temporal.Instant.from(at),
});

/**
 * The Worker's calls for one room; the agent's are paid calls, made only when a member asks.
 * An answer other than the ones a call expects is an error the caller's state can hold.
 */
export const roomWorkerApi = (room: RoomId): WorkerApi => ({
  async uploadImage(image) {
    const res = await inRoom.images.$post(
      { param: { roomId: room } },
      // the picture's own bytes and type, not JSON
      { headers: { "Content-Type": image.type }, init: { body: image } },
    );
    if (res.status === 409) return { ok: false, reason: { kind: "full" } };
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: (await res.json()).id };
  },
  async suggestTags(memo) {
    const res = await inRoom.tags.$post({ param: { roomId: room }, json: memo });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: (await res.json()).tags };
  },
  async tagCandidates() {
    const res = await inRoom.candidates.$post({ param: { roomId: room } });
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return (await res.json()).tags;
  },
  async findPlaces(memo) {
    const res = await inRoom.places.$post({ param: { roomId: room }, json: memo });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: (await res.json()).places.map(foundOf) };
  },
  async findByName(query, lang) {
    const res = await inRoom.find.$post({ param: { roomId: room }, json: { query, lang } });
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return (await res.json()).places.map(foundOf);
  },
  async expandLink(url, lang) {
    const res = await inRoom.expand.$post({ param: { roomId: room }, json: { url, lang } });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: await res.json() };
  },
  async whereIs(at, lang) {
    const res = await inRoom.where.$post({
      param: { roomId: room },
      json: { lat: at.lat, lng: at.lng, lang },
    });
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    const { place } = await res.json();
    return place === null ? null : foundOf(place);
  },
  async suggest({ at, ask, about }) {
    const res = await inRoom.suggest.$post({ param: { roomId: room }, json: { at, ask, about } });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: (await res.json()).added };
  },
  async draftDay(date, notes) {
    const res = await inRoom.draft.$post({
      param: { roomId: room },
      json: { date: date.toString() },
    });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    const { by, reason, intro, items } = await res.json();
    return {
      ok: true,
      value: {
        by,
        reason,
        intro,
        // the draft names the notes it was given; one that has since gone is left out
        items: items.flatMap((it) => {
          const note = notes.find((n) => n.id === it.id);
          // a time the Worker checked is one Temporal reads
          const time = it.time === null ? null : Temporal.PlainTime.from(it.time);
          return note === undefined ? [] : [{ note, time, minutes: it.minutes }];
        }),
      },
    };
  },
  async preview(url) {
    const res = await inRoom.preview.$post({ param: { roomId: room }, json: { url } });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: (await res.json()).preview };
  },
  async publication() {
    const res = await inRoom.publication.$post({ param: { roomId: room } });
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    const { publication } = await res.json();
    return publication === null ? null : publicationOf(publication);
  },
  async publish(lang) {
    const res = await inRoom.publish.$post({ param: { roomId: room }, json: { lang } });
    if (res.status === 429) return over(res);
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
    return { ok: true, value: publicationOf((await res.json()).publication) };
  },
  async withdraw() {
    const res = await inRoom.withdraw.$post({ param: { roomId: room } });
    if (res.status !== 200) throw new Error(`${res.url} answered ${res.status}`);
  },
});
