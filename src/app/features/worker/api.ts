import { Temporal } from "temporal-polyfill-lite";

import { hc, type ClientResponse } from "hono/client";

import { isRecord } from "../../shared/record";

import type { Api } from "../../../../.worker-types/worker";
import { isMemberId } from "../members/types";
import { isImageId } from "../notes/id";
import { tagOf } from "../notes/types";
import type { FoundPlace } from "../place/types";
import type { RoomId } from "../rooms/types";

import type { Answer, OverBudget, WorkerApi } from "./types";

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/** One of the room's paid calls: its answer, or the budget's refusal */
async function budgeted(
  request: Promise<ClientResponse<unknown>>,
): Promise<Answer<Record<string, unknown>, OverBudget>> {
  const res = await request;
  if (res.status === 429) {
    const ceiling = (await res.text()).endsWith("trip") ? "trip" : "day";
    return { ok: false, refused: { kind: "over", ceiling } };
  }
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return { ok: true, value: await answerOf(res) };
}

/** One of the room's free calls: the budget never answers it */
async function free(request: Promise<ClientResponse<unknown>>): Promise<Record<string, unknown>> {
  const res = await request;
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return answerOf(res);
}

/** An answer's value read on, a refusal passed along as it was */
const read = <T, U, R>(answer: Answer<T, R>, f: (value: T) => U): Answer<U, R> =>
  answer.ok ? { ok: true, value: f(answer.value) } : answer;

/** The answer's JSON, whose fields are read one by one below; one that is not an object is an error */
async function answerOf(res: {
  url: string;
  json(): Promise<unknown>;
}): Promise<Record<string, unknown>> {
  const answer: unknown = await res.json();
  if (!isRecord(answer)) throw new Error(`${res.url} answered with no object`);
  return answer;
}

/** The entries of a list in the answer that are what `of` reads; anything else is left out */
const listOf = <T>(value: unknown, of: (raw: unknown) => T | null): T[] =>
  (Array.isArray(value) ? value : []).flatMap((raw: unknown) => of(raw) ?? []);

const text = (v: unknown): v is string => typeof v === "string";
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A place as the Worker sends it: its point as `lat` and `lng` beside its name */
const placeOf = (p: unknown): FoundPlace | null =>
  isRecord(p) &&
  text(p.name) &&
  text(p.address) &&
  number(p.lat) &&
  number(p.lng) &&
  (p.hours === null || text(p.hours))
    ? { name: p.name, address: p.address, at: { lat: p.lat, lng: p.lng }, hours: p.hours }
    : null;

/** HH:MM as a time, or null when it is none or not one */
function timeOf(v: unknown): Temporal.PlainTime | null {
  if (!text(v)) return null;
  try {
    return Temporal.PlainTime.from(v);
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
    const { id } = await answerOf(res);
    if (!isImageId(id)) throw new Error(`${res.url} answered without an image id`);
    return { ok: true, value: id };
  },
  async suggestTags(memo) {
    return read(
      await budgeted(inRoom.tags.$post({ param: { roomId: room }, json: memo })),
      ({ tags }) =>
        listOf(tags, (t) => {
          if (!isRecord(t) || !number(t.p) || typeof t.isNew !== "boolean") return null;
          const tag = tagOf(t.tag);
          return tag === null ? null : { tag, p: t.p, isNew: t.isNew };
        }),
    );
  },
  async tagCandidates() {
    const { tags } = await free(inRoom.candidates.$post({ param: { roomId: room } }));
    return listOf(tags, tagOf);
  },
  async findPlaces(memo) {
    return read(
      await budgeted(inRoom.places.$post({ param: { roomId: room }, json: memo })),
      ({ places }) => listOf(places, placeOf),
    );
  },
  async findByName(query, lang) {
    const { places } = await free(
      inRoom.find.$post({ param: { roomId: room }, json: { query, lang } }),
    );
    return listOf(places, placeOf);
  },
  async expandLink(url, lang) {
    return read(
      await budgeted(inRoom.expand.$post({ param: { roomId: room }, json: { url, lang } })),
      (answer) => {
        const at = isRecord(answer.at) ? answer.at : null;
        return {
          // a link the Worker does not give back is the one asked about
          url: text(answer.url) ? answer.url : url,
          at: at !== null && number(at.lat) && number(at.lng) ? { lat: at.lat, lng: at.lng } : null,
        };
      },
    );
  },
  async whereIs(at, lang) {
    const { place } = await free(
      inRoom.where.$post({ param: { roomId: room }, json: { lat: at.lat, lng: at.lng, lang } }),
    );
    return placeOf(place);
  },
  async suggest({ at, ask, about }) {
    return read(
      await budgeted(
        inRoom.suggest.$post({
          param: { roomId: room },
          json: { at, ask, ...(about === null ? {} : { about }) },
        }),
      ),
      ({ added }) => (number(added) ? added : 0),
    );
  },
  async draftDay(date, notes) {
    return read(
      await budgeted(
        inRoom.draft.$post({ param: { roomId: room }, json: { date: date.toString() } }),
      ),
      (d) => ({
        by: isMemberId(d.by) ? d.by : null,
        reason: text(d.reason) ? d.reason : "",
        intro: text(d.intro) ? d.intro : "",
        // the draft names the notes it was given; one that has since gone is left out
        items: listOf(d.items, (it) => {
          const note = isRecord(it) ? notes.find((n) => n.id === it.id) : undefined;
          return note === undefined || !isRecord(it) ? null : { note, time: timeOf(it.time) };
        }),
      }),
    );
  },
  exportBooklet: null,
});
