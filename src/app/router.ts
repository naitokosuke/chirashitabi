import { createRouter, createWebHistory, type Router } from "vue-router";
import { routes } from "vue-router/auto-routes";

import { roomId } from "./features/rooms/types";
import type { useRoom } from "./features/sync/useRoom";

/**
 * The pages are the files in `pages/` (vue-router's file-based routes): `/` the person's trips,
 * `/new` a trip being made, `/rooms/<roomId>/<tab>` a room's tab, a sheet over it in the query.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [...routes, { path: "/:rest(.*)*", redirect: "/" }],
});

// Only a room id gets into a room's pages; a room's own URL opens on its canvas
router.beforeEach((to) => {
  if (!("roomId" in to.params)) return;
  const id = roomId(to.params.roomId);
  if (id === null) return "/";
  if (to.name === "/rooms/[roomId]")
    return { name: "/rooms/[roomId]/canvas", params: { roomId: id }, query: to.query };
});

/**
 * Opening the app at its root goes where the person was: the room this device was in last.
 * Done before the app is drawn, so the list never flashes on the way.
 */
export async function openWhereLeft(r: Router, room: ReturnType<typeof useRoom>) {
  await r.isReady();
  if (r.currentRoute.value.path !== "/") return;
  const last = room.remembered();
  if (last === null) return;
  await r.replace({ name: "/rooms/[roomId]/canvas", params: { roomId: last } });
}
