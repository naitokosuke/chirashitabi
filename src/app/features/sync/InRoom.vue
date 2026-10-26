<script lang="ts">
import { inject, type InjectionKey } from "vue";

import type { MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";
import type { TripSnapshot } from "../trip/types";
import type { WorkerApi } from "../worker/types";

/**
 * The room this device is in, as everything shown inside it has it: which room, who this
 * device is there, its trip as the room shows it now, and the Worker's calls for it. Each is
 * read where it is used, never kept: the room can change under a view kept alive (KeepAlive),
 * and these follow it.
 */
export interface Here {
  readonly room: RoomId;
  readonly me: MemberId;
  /** In a room there is always its trip: from the room's snapshot, or as this device kept it */
  readonly trip: TripSnapshot;
  readonly api: WorkerApi;
}

const HERE: InjectionKey<Here> = Symbol("here");

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
