<script lang="ts">
import { inject, type InjectionKey } from "vue";

import type { MemberId } from "../members/types";
import type { RoomId } from "../rooms/types";
import type { WorkerApi } from "../worker/types";

/**
 * The room this device is in, as everything shown inside it has it: which room, who this
 * device is there, and the Worker's calls for it. Each is read where it is used, never kept:
 * the room can change under a view kept alive (KeepAlive), and these follow it.
 */
export interface Here {
  readonly room: RoomId;
  readonly me: MemberId;
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
 * What is shown once this device is in a room (session.ts), told which room and who it is
 * there (useInRoom). The page that shows it passes the session as it is now, so what it
 * provides follows the session rather than the moment it was made.
 */
const props = defineProps<{ room: RoomId; me: MemberId }>();
// made again only when the room changes, not when the socket's link does
const api = computed(() => roomWorkerApi(props.room));
provide(HERE, {
  get room() {
    return props.room;
  },
  get me() {
    return props.me;
  },
  get api() {
    return api.value;
  },
});
</script>

<template>
  <slot />
</template>
