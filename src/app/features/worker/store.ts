import { defineStore } from "pinia";
import { shallowRef } from "vue";
import type { Temporal } from "temporal-polyfill-lite";
import type { Note } from "@/features/notes/types";

/** A suggested order and times for one day, from whichever member drafted it */
export interface DayDraft {
  by: string; // a member id
  reason: string; // why this order
  items: { note: Note; time?: Temporal.PlainTime }[];
  intro: string;
}

/** What the Cloudflare Worker will do for the room, besides sync */
export interface WorkerApi {
  /** Have a member order a day's notes and give them times */
  draftDay(date: Temporal.PlainDate, notes: Note[]): Promise<DayDraft>;
  /** Publish the booklet as a static page at /r/<room>/shiori */
  exportBooklet(): Promise<void>;
}

/** Null until a Worker is connected; the UI hides what needs it. */
export const useWorker = defineStore("worker", () => {
  const api = shallowRef<WorkerApi | null>(null);
  return { api };
});
