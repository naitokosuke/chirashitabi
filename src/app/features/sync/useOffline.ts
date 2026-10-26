import { computed, ref, watch } from "vue";

import { defineStore } from "pinia";

import { useSync } from "./useSync";

/**
 * Whether this device is cut off from the room, for the banner over every screen and for the
 * buttons that need the Worker. The browser's `offline` event is believed at once; its `online`
 * is not: on a plane's or a café's Wi-Fi the device has a network and no way out of it. In a
 * room, the socket reaching the room clears it (or being open still, when the browser was
 * wrong); out of a room there is no socket, so `online` has to do.
 *
 * A room that never let this device in (joining, the socket given up) is that room's trouble,
 * not the network's: the trips say so where it was opened (Rooms.vue) and everything else that
 * needs the Worker stays on offer.
 */
export const useOffline = defineStore("offline", () => {
  const sync = useSync();
  /** What the browser last said, believed only when it said offline */
  const browserOffline = ref(!navigator.onLine);
  /** In a room, the socket gave up reaching it */
  const unreachable = computed(() => sync.session.kind === "in" && sync.session.link === "failed");

  window.addEventListener("offline", () => (browserOffline.value = true));
  window.addEventListener("online", () => {
    // out of a room (or not yet in one) there is nothing better to ask; in one, a socket still
    // open is proof enough
    const s = sync.session;
    if (s.kind !== "in" || s.link === "connected") browserOffline.value = false;
  });
  // the room answered: whatever the browser said, this device is through
  watch(
    () => sync.session.kind !== "out" && sync.session.link === "connected",
    (through) => {
      if (through) browserOffline.value = false;
    },
  );

  const offline = computed(() => browserOffline.value || unreachable.value);
  return { offline };
});
