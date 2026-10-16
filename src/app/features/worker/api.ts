import { Temporal } from "temporal-polyfill-lite";

import { hc, type ClientResponse } from "hono/client";
import * as v from "valibot";

import { listOf } from "../../shared/list";

import type { Api } from "../../../../.worker-types/worker";
import { MemberIdSchema } from "../members/types";
import { ImageIdSchema } from "../notes/id";
import { TagSchema } from "../notes/types";
import { HttpUrlSchema } from "../place/google-maps";
import type { FoundPlace } from "../place/types";
import type { RoomId } from "../rooms/types";

import type { Answer, OverBudget, Publication, WorkerApi } from "./types";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/** One of the room's paid calls: its answer as `schema` reads it, or the budget's refusal */
async function budgeted<S extends v.GenericSchema>(
  request: Promise<ClientResponse<unknown>>,
  schema: S,
): Promise<Answer<v.InferOutput<S>, OverBudget>> {
  const res = await request;
  if (res.status === 429) {
    const ceiling = (await res.text()).endsWith("trip") ? "trip" : "day";
    return { ok: false, refused: { kind: "over", ceiling } };
  }
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return { ok: true, value: await answerOf(res, schema) };
}

/** One of the room's free calls, its answer as `schema` reads it: the budget never answers it */
async function free<S extends v.GenericSchema>(
  request: Promise<ClientResponse<unknown>>,
  schema: S,
): Promise<v.InferOutput<S>> {
  const res = await request;
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return answerOf(res, schema);
}

/** An answer's value read on, a refusal passed along as it was */
const read = <T, U, R>(answer: Answer<T, R>, f: (value: T) => U): Answer<U, R> =>
  answer.ok ? { ok: true, value: f(answer.value) } : answer;

/**
 * The answer's JSON as `schema` reads it. Its fields fall back where an answer may go without
 * them, so only an answer that is not what the call returns at all is an error
 */
async function answerOf<S extends v.GenericSchema>(
  res: { url: string; json(): Promise<unknown> },
  schema: S,
): Promise<v.InferOutput<S>> {
  const answer = v.safeParse(schema, await res.json());
  if (!answer.success) throw new Error(`${res.url} answered with something else`);
  return answer.output;
}

const finite = v.pipe(v.number(), v.finite());
const LatLngSchema = v.object({ lat: finite, lng: finite });

/** A place as the Worker sends it: its point as `lat` and `lng` beside its name */
const PlaceSchema = v.pipe(
  v.object({
    ...LatLngSchema.entries,
    name: v.string(),
    address: v.string(),
    hours: v.nullable(v.string()),
  }),
  v.transform(({ name, address, lat, lng, hours }): FoundPlace => ({
    name,
    address,
    at: { lat, lng },
    hours,
  })),
);

/** The public booklet as the Worker says where it is: an https link on its own host, and when */
const PublicationSchema = v.pipe(
  v.object({ url: HttpUrlSchema, at: v.pipe(v.string(), v.isoTimestamp()) }),
  v.transform(({ url, at }): Publication => ({ url, at: Temporal.Instant.from(at) })),
);

/** HH:MM as a time, or null when it is none or not one */
function timeOf(time: string | null): Temporal.PlainTime | null {
  if (time === null) return null;
  try {
    return Temporal.PlainTime.from(time);
  } catch {
    return null;
  }
}

/** The Worker's calls for one room; the agent's are paid calls, made only when a member asks */
export const roomWorkerApi = (room: RoomId): WorkerApi => ({
  async uploadImage(image) {
    const res = await fetch(`/api/rooms/${room}/images`, {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
    });
    if (res.status === 409) return { ok: false, refused: { kind: "full" } };
    if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
    const { id } = await answerOf(res, v.object({ id: ImageIdSchema }));
    return { ok: true, value: id };
  },
  async suggestTags(memo) {
    return read(
      await budgeted(
        inRoom.tags.$post({ param: { roomId: room }, json: memo }),
        v.object({
          tags: listOf(v.object({ tag: TagSchema, p: finite, isNew: v.boolean() })),
        }),
      ),
      ({ tags }) => tags,
    );
  },
  async tagCandidates() {
    const { tags } = await free(
      inRoom.candidates.$post({ param: { roomId: room } }),
      v.object({ tags: listOf(TagSchema) }),
    );
    return tags;
  },
  async findPlaces(memo) {
    return read(
      await budgeted(
        inRoom.places.$post({ param: { roomId: room }, json: memo }),
        v.object({ places: listOf(PlaceSchema) }),
      ),
      ({ places }) => places,
    );
  },
  async findByName(query, lang) {
    const { places } = await free(
      inRoom.find.$post({ param: { roomId: room }, json: { query, lang } }),
      v.object({ places: listOf(PlaceSchema) }),
    );
    return places;
  },
  async expandLink(url, lang) {
    return budgeted(
      inRoom.expand.$post({ param: { roomId: room }, json: { url, lang } }),
      v.object({
        // a link the Worker does not give back is the one asked about
        url: v.fallback(v.string(), url),
        at: v.fallback(v.nullable(LatLngSchema), null),
      }),
    );
  },
  async whereIs(at, lang) {
    const { place } = await free(
      inRoom.where.$post({ param: { roomId: room }, json: { lat: at.lat, lng: at.lng, lang } }),
      v.object({ place: v.fallback(v.nullable(PlaceSchema), null) }),
    );
    return place;
  },
  async suggest({ at, ask, about }) {
    return read(
      await budgeted(
        inRoom.suggest.$post({
          param: { roomId: room },
          json: { at, ask, ...(about === null ? {} : { about }) },
        }),
        v.object({ added: v.fallback(finite, 0) }),
      ),
      ({ added }) => added,
    );
  },
  async draftDay(date, notes) {
    return read(
      await budgeted(
        inRoom.draft.$post({ param: { roomId: room }, json: { date: date.toString() } }),
        v.object({
          by: v.fallback(v.nullable(MemberIdSchema), null),
          reason: v.fallback(v.string(), ""),
          intro: v.fallback(v.string(), ""),
          items: listOf(
            v.object({
              id: v.string(),
              time: v.fallback(v.nullable(v.string()), null),
              // a Worker from before drafts said how long sends none
              minutes: v.fallback(
                v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24 * 60))),
                null,
              ),
            }),
          ),
        }),
      ),
      (d) => ({
        by: d.by,
        reason: d.reason,
        intro: d.intro,
        // the draft names the notes it was given; one that has since gone is left out
        items: d.items.flatMap((it) => {
          const note = notes.find((n) => n.id === it.id);
          return note === undefined ? [] : [{ note, time: timeOf(it.time), minutes: it.minutes }];
        }),
      }),
    );
  },
  async publication() {
    const { publication } = await free(
      inRoom.publication.$post({ param: { roomId: room } }),
      v.object({ publication: v.nullable(PublicationSchema) }),
    );
    return publication;
  },
  async publish(lang) {
    return read(
      await budgeted(
        inRoom.publish.$post({ param: { roomId: room }, json: { lang } }),
        v.object({ publication: PublicationSchema }),
      ),
      ({ publication }) => publication,
    );
  },
  async withdraw() {
    await free(inRoom.withdraw.$post({ param: { roomId: room } }), v.object({}));
  },
});
