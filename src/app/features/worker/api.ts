import { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { ImageId, NoteId } from "../notes/types";
import type { FoundPlace, LatLng } from "../place/types";
import type { RoomId } from "../rooms/types";

import type { WorkerApi } from "./types";

/** The budget refused the call (docs/auth-and-security.md): asking again today will not help */
export class OverBudget extends Error {
  constructor(readonly ceiling: "day" | "trip") {
    super(`over the ${ceiling} budget`);
  }
}

const headers = { "Content-Type": "application/json" };

/** The draft as the Worker sends it: notes by id, times as HH:MM */
interface WireDraft {
  by: string;
  reason: string;
  intro: string;
  items: { id: string; time: string | null }[];
}

/** A POST to one of the room's agent calls; a refusal by the budget is an OverBudget */
async function call(
  room: RoomId,
  what: "draft" | "suggest" | "tags" | "candidates" | "places" | "where" | "find" | "expand",
  body: unknown,
): Promise<Response> {
  const res = await fetch(`/api/rooms/${room}/${what}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 429)
    throw new OverBudget((await res.text()).endsWith("trip") ? "trip" : "day");
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
  return res;
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
    return ((await res.json()) as { id: string }).id as ImageId;
  },
  async suggestTags(memo) {
    const res = await call(room, "tags", memo);
    return ((await res.json()) as { tags: { tag: string; p: number; isNew: boolean }[] }).tags;
  },
  async tagCandidates() {
    const res = await call(room, "candidates", {});
    return ((await res.json()) as { tags: string[] }).tags;
  },
  async findPlaces(memo) {
    const res = await call(room, "places", memo);
    const { places } = (await res.json()) as {
      places: { name: string; address: string; lat: number; lng: number; hours: string | null }[];
    };
    return places.map((p): FoundPlace => ({
      name: p.name,
      address: p.address,
      at: { lat: p.lat, lng: p.lng },
      hours: p.hours,
    }));
  },
  async findByName(query, lang) {
    const res = await call(room, "find", { query, lang });
    const { places } = (await res.json()) as {
      places: { name: string; address: string; lat: number; lng: number; hours: string | null }[];
    };
    return places.map((p): FoundPlace => ({
      name: p.name,
      address: p.address,
      at: { lat: p.lat, lng: p.lng },
      hours: p.hours,
    }));
  },
  async expandLink(url, lang) {
    const res = await call(room, "expand", { url, lang });
    return (await res.json()) as { url: string; at: LatLng | null };
  },
  async whereIs(at, lang) {
    const res = await call(room, "where", { lat: at.lat, lng: at.lng, lang });
    const { place } = (await res.json()) as {
      place: {
        name: string;
        address: string;
        lat: number;
        lng: number;
        hours: string | null;
      } | null;
    };
    return place === null
      ? null
      : {
          name: place.name,
          address: place.address,
          at: { lat: place.lat, lng: place.lng },
          hours: place.hours,
        };
  },
  async suggest(at) {
    const res = await call(room, "suggest", { at });
    return ((await res.json()) as { added: number }).added;
  },
  async draftDay(date, notes) {
    const res = await call(room, "draft", { date: date.toString() });
    const d = (await res.json()) as WireDraft;
    // the draft names the notes it was given; one that has since gone is left out
    const byId = new Map(notes.map((n) => [n.id, n]));
    return {
      by: d.by as MemberId,
      reason: d.reason,
      intro: d.intro,
      items: d.items.flatMap((it) => {
        const note = byId.get(it.id as NoteId);
        if (note === undefined) return [];
        return [{ note, time: it.time === null ? null : Temporal.PlainTime.from(it.time) }];
      }),
    };
  },
  exportBooklet: null,
});
