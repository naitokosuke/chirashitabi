import { createWebHistory } from "vue-router";
import { resolver } from "vue-router/auto-resolver";
import { experimental_createRouter, type EXPERIMENTAL_Router } from "vue-router/experimental";

import type { useRoom } from "./features/sync/useRoom";

/**
 * The pages are the files in `pages/` (vue-router's file-based routes): `/` the person's trips,
 * `/new` a trip being made, `/rooms/<roomId>/<tab>` a room's tab, a sheet over it in the query.
 * A room's id is parsed by `pages/__params/roomId.ts`: a URL naming anything else matches no page.
 */
export const router = experimental_createRouter({
  history: createWebHistory(),
  resolver,
});

// A URL that matches no page goes to the trips; a room's own URL opens on its canvas
router.beforeEach((to) => {
  if (to.matched.length === 0) return "/";
  if (to.name === "/rooms/[roomId=roomId]")
    return {
      name: "/rooms/[roomId=roomId]/canvas",
      params: { roomId: to.params.roomId },
      query: to.query,
    };
});

/**
 * Opening the app at its root goes where the person was: the room this device was in last.
 * Done before the app is drawn, so the list never flashes on the way.
 */
export async function openWhereLeft(r: EXPERIMENTAL_Router, room: ReturnType<typeof useRoom>) {
  await r.isReady();
  if (r.currentRoute.value.path !== "/") return;
  const last = room.remembered();
  if (last === null) return;
  await r.replace({ name: "/rooms/[roomId=roomId]/canvas", params: { roomId: last } });
}
