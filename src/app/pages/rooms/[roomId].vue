<script setup lang="ts" vapor>
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import Form, { type FormMode } from "../../features/notes/Form.vue";
import type { NoteInput } from "../../features/notes/types";
import Rooms from "../../features/rooms/Rooms.vue";
import { roomId } from "../../features/rooms/types";
import Connection from "../../features/sync/Connection.vue";
import { useRoom } from "../../features/sync/useRoom";
import { useSync } from "../../features/sync/useSync";
import { queryStrings, sheetOf, viewOf } from "../../shell";

import { usePlace } from "./[roomId]/canvas.vue";

/**
 * A room: its tabs, each a page kept once it is opened (KeepAlive), so coming back to one shows
 * it as it was (the map's tiles, the booklet's scroll, the desk's pan and zoom), with nothing to
 * load; and the memo sheet over them, open on the URL's query, so back closes it. Being here
 * enters the room the URL names, and leaving leaves it. Until this device is in it (session.ts),
 * the trips are shown, saying it is on its way.
 */
const route = useRoute("/rooms/[roomId]");
const router = useRouter();
const room = useRoom();
const sync = useSync();
const place = usePlace();

/** The room the URL names; the router lets in only a room id (router.ts) */
const id = computed(() => roomId(route.params.roomId));
watch(
  id,
  (r) => {
    const s = sync.session;
    if (r !== null && (s.kind === "out" || s.room !== r)) room.connect(r);
  },
  { immediate: true },
);
onBeforeUnmount(() => room.leave());
/** Put out of this room (removed, left, the room deleted): back to the trips */
watch(
  () => room.gone,
  (g) => {
    if (g !== null && g.room === id.value) void router.replace("/");
  },
);

const inRoom = computed(() => sync.session.kind === "in" && sync.session.room === id.value);
const tab = computed(() => viewOf(route.name) ?? "canvas");
const form = computed(() => sheetOf(queryStrings(route.query)));
/** The one sheet, over the tab it was opened from, while it is open */
const sheet = computed((): FormMode | null =>
  form.value === null ? null : { kind: "sheet", target: form.value, from: tab.value },
);

/** The sheet's own step: going back is closing it, and leaves nothing to go forward to */
function closeSheet() {
  const here = router.resolve({ name: route.name, params: route.params }).fullPath;
  const back = (window.history.state as { back?: unknown } | null)?.back;
  if (back === here) router.back();
  else void router.replace({ query: {} });
}
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place(input, "quiet");
    return;
  }
  // written over the canvas it pops there; from another tab it lands quietly and the toast says where
  const how = tab.value === "canvas" ? "pop" : "away";
  closeSheet();
  // let the sheet leave first, then place
  setTimeout(() => place(input, how), 220);
}
</script>

<template>
  <template v-if="inRoom">
    <!-- a covered tab is inert: the sheet is the one thing to use -->
    <main :inert="sheet !== null">
      <RouterView v-slot="{ Component }">
        <KeepAlive><component :is="Component" /></KeepAlive>
      </RouterView>
    </main>
    <Transition name="ct-slide">
      <Form v-if="sheet" :mode="sheet" @close="closeSheet" @save="onSave" />
    </Transition>
    <Connection />
  </template>
  <Rooms v-else />
</template>

<style scoped>
main {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
</style>
