import type { Temporal } from "temporal-polyfill-lite";

import type { MemberId } from "../members/types";
import type { Scheduled } from "../notes/types";

/** A suggested order and times for one day, from whichever member drafted it */
export interface DayDraft {
  by: MemberId;
  reason: string; // why this order
  items: { note: Scheduled; time: Temporal.PlainTime | null }[];
  intro: string;
}

/** What the Cloudflare Worker will do for the room, besides sync */
export interface WorkerApi {
  /** Have a member order a day's notes and give them times */
  draftDay(date: Temporal.PlainDate, notes: Scheduled[]): Promise<DayDraft>;
  /**
   * Publish the booklet as a static page at /r/<slug>/shiori, with a fresh slug each time;
   * null while the Worker cannot, and the UI hides it
   */
  exportBooklet: (() => Promise<void>) | null;
}
