import { computed } from "vue";

import * as v from "valibot";
import { useRouter, useRoute } from "vue-router";

import type { RoomId } from "../features/rooms/types";

/**
 * Where the trips (`<Rooms>`) lead, for the pages that show them: into a trip, on its canvas,
 * and making one, a step of its own (`/new`), so back puts its sheet away
 */
export function useTrips() {
  const router = useRouter();
  const route = useRoute();
  /** The URL names the trip, and its page enters it (pages/rooms/[roomId=roomId].vue) */
  const placeOf = (id: RoomId) => ({
    name: "/rooms/[roomId=roomId]/canvas" as const,
    params: { roomId: id },
  });
  return {
    creating: computed(() => route.name === "/new"),
    /** A trip's own path: built from a checked room id (a UUID), so nothing else gets into the href */
    hrefOf: (id: RoomId) => router.resolve(placeOf(id)).href,
    newHref: "/new",
    open: (id: RoomId) => void router.push(placeOf(id)),
    create: () => void router.push("/new"),
    close() {
      const state = v.safeParse(v.object({ back: v.string() }), window.history.state);
      if (state.success && state.output.back === "/") router.back();
      else void router.replace("/");
    },
    /** The new trip takes the sheet's place: back from it goes to the list, not to an empty form */
    created: (id: RoomId) => void router.replace(placeOf(id)),
  };
}
