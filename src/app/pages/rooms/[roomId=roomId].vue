<script setup lang="ts" vapor>
import { computed, onBeforeUnmount, watch } from "vue";

import * as v from "valibot";
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

import { sheetOf, viewOf } from "./url";

/**
 * A room: its tabs, each a page kept once it is opened (KeepAlive), so coming back to one shows
 * it as it was (the map's tiles, the booklet's scroll, the desk's pan and zoom), with nothing to
 * load; and the memo sheet over them, open on the URL's query, so back closes it. Being here
 * enters the room the URL names, and leaving leaves it. Until this device is in it (session.ts),
 * the trips are shown, saying it is on its way.
 */
// The sheet's query, as params of every tab's route (pages/__params/): a value that is not one is none
definePage({
  params: { query: { sheet: "sheet", note: "string", lat: "number", lng: "number" } },
});

const route = useRoute("/rooms/[roomId=roomId]");
const router = useRouter();
const room = useRoom();
const sync = useSync();
const place = usePlace();
const i18n = useI18n();
const { creating, hrefOf, newHref, open, create, close, created } = useTrips();

// The room the URL names, `route.params.roomId`: only a room id matches this page
// (pages/__params/roomId.ts)
watch(
  () => route.params.roomId,
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
    if (g !== null && g.room === route.params.roomId) void router.replace("/");
  },
);

const inRoom = computed(
  () => sync.session.kind === "in" && sync.session.room === route.params.roomId,
);
const tab = computed(() => viewOf(route.name) ?? "canvas");
const form = computed(() => sheetOf(route.params));
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

/**
 * The sheet's own step: going back is closing it, and leaves nothing to go forward to. The tab
 * with no sheet is its name and the room alone: the sheet's query is params of the route too.
 */
function closeSheet() {
  const tabOnly = { name: route.name, params: { roomId: route.params.roomId } };
  const state = v.safeParse(v.object({ back: v.string() }), window.history.state);
  if (state.success && state.output.back === router.resolve(tabOnly).fullPath) router.back();
  else void router.replace(tabOnly);
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
