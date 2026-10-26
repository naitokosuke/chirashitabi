<script lang="ts">
import { inject } from "vue";

import type { MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";
import type { TripSnapshot } from "../trip/types";

import { HERE, type Here } from "./here";

/** The room this device is in, for a view shown only inside one (InRoom) */
export function useInRoom(): Here {
  const here = inject(HERE);
  if (here === undefined) throw new Error("useInRoom outside InRoom");
  return here;
}
</script>

<script setup lang="ts" vapor>
import { computed, provide } from "vue";

import { roomWorkerApi } from "../worker/api";

/**
 * What is shown once this device is in a room (session.ts), told which room, who it is there
 * and the trip (useInRoom). The page that shows it passes the session and the trip as they are
 * now, so what it provides follows them rather than the moment it was made.
 */
const props = defineProps<{ room: RoomId; me: MemberId; trip: TripSnapshot }>();
// made again only when the room changes, not when the socket's link does
const api = computed(() => roomWorkerApi(props.room));
provide(HERE, {
  get room() {
    return props.room;
  },
  get me() {
    return props.me;
  },
  get trip() {
    return props.trip;
  },
  get api() {
    return api.value;
  },
});
</script>

<template>
  <slot />
</template>
