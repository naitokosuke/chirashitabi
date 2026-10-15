import { computed } from "vue";

import { defineStore } from "pinia";

import { useSync } from "../sync/useSync";

import { roomWorkerApi } from "./api";

/**
 * What the room's agent does for its members, through the Worker, for the room of the session;
 * null out of a room, and the UI hides what needs it.
 */
export const useWorker = defineStore("worker", () => {
  const sync = useSync();
  // made again only when the room changes, not when the socket's link does
  const api = computed(() => (sync.room === null ? null : roomWorkerApi(sync.room)));
  return { api };
});
