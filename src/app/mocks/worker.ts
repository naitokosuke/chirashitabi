import { Temporal } from "temporal-polyfill-lite";

import type { WorkerApi } from "../features/worker/types";

import { CLAUDE } from "./members";

const SLOTS = ["10:00", "12:30", "16:00", "20:30"].map((s) => Temporal.PlainTime.from(s));

/** About as long as a real draft takes, so the pending state can be seen while developing */
const THINKING_MS = 1200;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stands in for the Cloudflare Worker: canned drafts, no real export. */
export const mockWorker = (): WorkerApi => ({
  // the mocks have no room to write into as the agent
  suggest: null,
  // nor anywhere to keep a picture
  uploadImage: null,
  // nor Clef to ask
  suggestTags: null,
  findPlaces: null,
  async draftDay(_date, notes) {
    await wait(THINKING_MS);
    return {
      by: CLAUDE,
      reason: "Given the locations and opening hours, this order means the least walking.",
      items: notes.map((note, i) => ({ note, time: SLOTS.at(i) ?? null })),
      intro: "Xiaolongbao for lunch, Jiufen in the evening, then beer in Xinyi.",
    };
  },
  exportBooklet: async () => {
    window.alert("In production this exports a static page to /r/<slug>/shiori");
  },
});
