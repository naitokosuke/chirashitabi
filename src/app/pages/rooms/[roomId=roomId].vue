<script setup lang="ts" vapor>
import { computed, onBeforeUnmount, watch } from "vue";

import { RouterView, useRoute, useRouter } from "vue-router";

import { useI18n } from "../../i18n/useI18n";

import { usePlace } from "../../features/canvas/usePlace";
import Form, { type FormMode } from "../../features/notes/Form.vue";
import type { NoteInput } from "../../features/notes/types";
import Rooms from "../../features/rooms/Rooms.vue";
import Connection from "../../features/sync/Connection.vue";
import { useRoom } from "../../features/sync/useRoom";
import { useSync } from "../../features/sync/useSync";
import { useTrips } from "../useTrips";

import { queryStrings, sheetOf, viewOf } from "./url";

/**
 * A room: its tabs, each a page kept once it is opened (KeepAlive), so coming back to one shows
 * it as it was (the map's tiles, the booklet's scroll, the desk's pan and zoom), with nothing to
 * load; and the memo sheet over them, open on the URL's query, so back closes it. Being here
 * enters the room the URL names, and leaving leaves it. Until this device is in it (session.ts),
 * the trips are shown, saying it is on its way.
 */
const route = useRoute("/rooms/[roomId=roomId]");
const router = useRouter();
const room = useRoom();
const sync = useSync();
const place = usePlace();
const i18n = useI18n();
const { creating, hrefOf, newHref, open, create, close, created } = useTrips();

/** The room the URL names; only a room id matches this page (pages/__params/roomId.ts) */
const id = computed(() => route.params.roomId);
watch(
  id,
  (r) => {
    const s = sync.session;
    if (s.kind === "out" || s.room !== r) room.connect(r);
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
const BACK = {
  home: "nav.home",
  canvas: "nav.canvas",
  memo: "nav.memo",
  map: "nav.map",
  shiori: "nav.booklet",
} as const;
/** The one sheet, over the tab it was opened from (its way back names it), while it is open */
const sheet = computed((): FormMode | null =>
  form.value === null
    ? null
    : {
        kind: "sheet",
        target: form.value,
        back: i18n.t(BACK[tab.value]),
        onMap: tab.value === "map",
      },
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
      <!-- the tabs are layers in the same box: the one coming up fades in over the one going -->
      <RouterView v-slot="{ Component }">
        <Transition name="ct-fade">
          <KeepAlive><component :is="Component" /></KeepAlive>
        </Transition>
      </RouterView>
    </main>
    <Transition name="ct-slide">
      <Form v-if="sheet !== null" :mode="sheet" @close="closeSheet" @save="onSave" />
    </Transition>
    <Connection />
  </template>
  <Rooms
    v-else
    :creating
    :href-of
    :new-href
    @open="open"
    @create="create"
    @close="close"
    @created="created"
  />
</template>

<style scoped>
main {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
</style>
