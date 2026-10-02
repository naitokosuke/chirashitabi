import { Temporal } from "temporal-polyfill-lite";

import type { WorkerApi } from "../features/worker/types";

import { CLAUDE } from "./members";

const SLOTS = ["10:00", "12:30", "16:00", "20:30"].map((s) => Temporal.PlainTime.from(s));

/** Stands in for the Cloudflare Worker: canned drafts, no real export. */
export const mockWorker = (): WorkerApi => ({
  async draftDay(_date, notes) {
    return {
      by: CLAUDE,
      reason: "Given the locations and opening hours, this order means the least walking.",
      items: notes.map((note, i) => ({ note, time: SLOTS.at(i) ?? null })),
      intro: "Xiaolongbao for lunch, Jiufen in the evening, then beer in Xinyi.",
    };
  },
  async exportBooklet() {
    window.alert("In production this exports a static page to /r/<slug>/shiori");
  },
});
