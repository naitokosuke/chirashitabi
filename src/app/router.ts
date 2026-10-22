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
  // its params carry the sheet's query too (pages/rooms/[roomId=roomId].vue)
  if (to.name === "/rooms/[roomId=roomId]")
    return { name: "/rooms/[roomId=roomId]/canvas", params: to.params };
});

/**
 * How long the app waits to hear whose this device's kept rooms are before drawing any: a
 * slow answer still puts things right when it comes (useRoom's check)
 */
const PATIENCE = 1500;

/**
 * Opening the app at its root goes where the person was: the room this device was in last.
 * Done before the app is drawn, so the list never flashes on the way, and once the Worker has
 * said who is signed in, so a browser another person used opens none of theirs.
 */
export async function openWhereLeft(r: EXPERIMENTAL_Router, room: ReturnType<typeof useRoom>) {
  await Promise.race([room.check(), new Promise((resolve) => setTimeout(resolve, PATIENCE))]);
  await r.isReady();
  if (r.currentRoute.value.path !== "/") return;
  const last = room.remembered();
  if (last === null) return;
  await r.replace({ name: "/rooms/[roomId=roomId]/canvas", params: { roomId: last } });
}
