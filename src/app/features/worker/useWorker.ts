import { defineStore } from "pinia";
import { shallowRef } from "vue";
import type { WorkerApi } from "./types";

/** Null until a Worker is connected; the UI hides what needs it. */
export const useWorker = defineStore("worker", () => {
  const api = shallowRef<WorkerApi | null>(null);
  return { api };
});
