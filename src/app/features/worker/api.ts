import { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { NoteId } from "../notes/types";
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

/** The Worker's calls for one room; each is a paid call, made only when a member asks */
export const roomWorkerApi = (room: RoomId): WorkerApi => ({
  async draftDay(date, notes) {
    const res = await fetch(`/api/rooms/${room}/draft`, {
      method: "POST",
      headers,
      body: JSON.stringify({ date: date.toString() }),
    });
    if (res.status === 429)
      throw new OverBudget((await res.text()).endsWith("trip") ? "trip" : "day");
    if (!res.ok) throw new Error(`${res.url} answered ${res.status}`);
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
