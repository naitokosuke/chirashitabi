import { createRouter, createWebHistory, type Router } from "vue-router";

import type { useRoom } from "./features/sync/useRoom";
import { locationOf } from "./shell";

/**
 * The URL is where the app is (shell.ts): `/` the person's trips, `/new` a trip being made,
 * `/rooms/<roomId>/<tab>` a room's tab, a sheet over it in the query. The router only keeps the
 * URL and the history; nothing is rendered by it. The shell draws every view itself and keeps
 * them mounted, which a RouterView would not, so moving between tabs rebuilds nothing.
 */
const nothing = { render: () => null };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: nothing },
    { path: "/new", component: nothing },
    { path: "/rooms/:roomId/:tab?", component: nothing },
    { path: "/:rest(.*)*", redirect: "/" },
  ],
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
  await r.replace(locationOf({ kind: "room", room: last, state: { tab: "canvas", form: null } }));
}
