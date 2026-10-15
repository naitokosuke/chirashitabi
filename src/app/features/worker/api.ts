import { Temporal } from "temporal-polyfill-lite";

import { hc, type ClientResponse } from "hono/client";

import type { Api } from "../../../../.worker-types/worker";
import { isImageId, type RoomId } from "../../../contract/ids";
import { isRecord } from "../../../contract/record";
import type { FoundPlace } from "../place/types";

import type { WorkerApi } from "./types";

/** The budget refused the call (docs/auth-and-security.md): asking again today will not help */
export class OverBudget extends Error {
  constructor(readonly ceiling: "day" | "trip") {
    super(`over the ${ceiling} budget`);
  }
}

/** A room's calls; every one says JSON, as the Worker's gate wants, even one with no body */
const inRoom = hc<Api>("/", { headers: { "Content-Type": "application/json" } }).api.rooms[
  ":roomId"
];

/** One of the room's agent calls; a refusal by the budget is an OverBudget */
async function call(request: Promise<ClientResponse<unknown>>): Promise<Record<string, unknown>> {
  const res = await request;
  if (res.status === 429)
    throw new OverBudget((await res.text()).endsWith("trip") ? "trip" : "day");
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return answerOf(res);
}

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

/** The room already keeps as many pictures as it may */
export class RoomFull extends Error {}

/** The Worker's calls for one room; the agent's are paid calls, made only when a member asks */
export const roomWorkerApi = (room: RoomId): WorkerApi => ({
  async uploadImage(image) {
    const res = await fetch(`/api/rooms/${room}/images`, {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
    });
    if (res.status === 409) throw new RoomFull();
    if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
    const { id } = await answerOf(res);
    if (!isImageId(id)) throw new Error(`${res.url} answered without an image id`);
    return id;
  },
  async suggestTags(memo) {
    const { tags } = await call(inRoom.tags.$post({ param: { roomId: room }, json: memo }));
    return listOf(tags, (t) =>
      isRecord(t) && text(t.tag) && number(t.p) && typeof t.isNew === "boolean"
        ? { tag: t.tag, p: t.p, isNew: t.isNew }
        : null,
    );
  },
  async tagCandidates() {
    const { tags } = await call(inRoom.candidates.$post({ param: { roomId: room } }));
    return listOf(tags, (t) => (text(t) ? t : null));
  },
  async findPlaces(memo) {
    const { places } = await call(inRoom.places.$post({ param: { roomId: room }, json: memo }));
    return listOf(places, placeOf);
  },
  async findByName(query, lang) {
    const { places } = await call(
      inRoom.find.$post({ param: { roomId: room }, json: { query, lang } }),
    );
    return listOf(places, placeOf);
  },
  async expandLink(url, lang) {
    const answer = await call(
      inRoom.expand.$post({ param: { roomId: room }, json: { url, lang } }),
    );
    const at = isRecord(answer.at) ? answer.at : null;
    return {
      // a link the Worker does not give back is the one asked about
      url: text(answer.url) ? answer.url : url,
      at: at !== null && number(at.lat) && number(at.lng) ? { lat: at.lat, lng: at.lng } : null,
    };
  },
  async whereIs(at, lang) {
    const { place } = await call(
      inRoom.where.$post({ param: { roomId: room }, json: { lat: at.lat, lng: at.lng, lang } }),
    );
    return placeOf(place);
  },
  async suggest({ at, ask, about }) {
    const { added } = await call(
      inRoom.suggest.$post({
        param: { roomId: room },
        json: { at, ask, ...(about === null ? {} : { about }) },
      }),
    );
    return number(added) ? added : 0;
  },
  async draftDay(date, notes) {
    const d = await call(
      inRoom.draft.$post({ param: { roomId: room }, json: { date: date.toString() } }),
    );
    return {
      by: text(d.by) ? d.by : "",
      reason: text(d.reason) ? d.reason : "",
      intro: text(d.intro) ? d.intro : "",
      // the draft names the notes it was given; one that has since gone is left out
      items: listOf(d.items, (it) => {
        const note = isRecord(it) ? notes.find((n) => n.id === it.id) : undefined;
        return note === undefined || !isRecord(it) ? null : { note, time: timeOf(it.time) };
      }),
    };
  },
  exportBooklet: null,
});
