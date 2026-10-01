import { defineStore } from "pinia";
import { shallowRef } from "vue";
import type { Temporal } from "temporal-polyfill-lite";
import type { Note } from "@/features/notes/types";

/** Claude's suggested order and times for one day */
export interface DayDraft {
  items: { note: Note; time?: Temporal.PlainTime }[];
  intro: string;
}

/** What the Cloudflare Worker will do for the room, besides sync */
export interface WorkerApi {
  /** Ask Claude to order a day's notes and give them times */
  draftDay(date: Temporal.PlainDate, notes: Note[]): Promise<DayDraft>;
  /** Publish the booklet as a static page at /r/<room>/shiori */
  exportBooklet(): Promise<void>;
}

/** Null until a Worker is connected; the UI hides what needs it. */
export const useWorker = defineStore("worker", () => {
  const api = shallowRef<WorkerApi | null>(null);
  return { api };
});
