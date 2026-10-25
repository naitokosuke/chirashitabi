<script setup lang="ts" vapor>
import { computed, onBeforeUnmount, watch } from "vue";

import { useQueryState } from "@pinia/colada";
import * as v from "valibot";
import { RouterView, useRoute, useRouter } from "vue-router";

import { useI18n } from "../../i18n/useI18n";

import { providePlace, type PlaceHow } from "../../features/canvas/usePlace";
import Form, { type FormMode } from "../../features/notes/Form.vue";
import type { NoteInput } from "../../features/notes/types";
import Rooms from "../../features/rooms/Rooms.vue";
import type { RoomId } from "../../features/rooms/types";
import Connection from "../../features/sync/Connection.vue";
import InRoom from "../../features/sync/InRoom.vue";
import { roomKeys } from "../../features/sync/keys";
import { useRoom } from "../../features/sync/useRoom";
import { useSync } from "../../features/sync/useSync";
import { useTrips } from "../useTrips";

import { sheetOf, viewOf } from "./url";

/**
 * A room: its tabs, each a page kept once it is opened in this room (KeepAlive), so coming back
 * to one shows it as it was (the map's tiles, the booklet's scroll, the desk's pan and zoom),
 * with nothing to load; and the memo sheet over them, open on the URL's query, so back closes it. Being here
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
const place = providePlace();
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
onBeforeUnmount(room.leave);
/** Put out of this room (removed, left, the room deleted): back to the trips */
watch(
  () => room.gone,
  (g) => {
    if (g !== null && g.room === route.params.roomId) void router.replace("/");
  },
);

/** The room's trip, as the room shows it: there from the moment this device is in it (useRoom) */
const { data: trip } = useQueryState(() => roomKeys.trip(sync.room));
/** The session and the trip while this device is in the room the URL names; null until then */
const here = computed(() => {
  const s = sync.session;
  const t = trip.value;
  return s.kind === "in" && s.room === route.params.roomId && t !== undefined
    ? { room: s.room, me: s.me, trip: t }
    : null;
});
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
/**
 * A memo saved with the sheet closing, placed once the sheet has left (sheetLeft), in the room
 * it was written in
 */
let saved: { room: RoomId; input: NoteInput; how: PlaceHow } | null = null;
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place(input, "quiet");
    return;
  }
  const room = here.value?.room;
  if (room === undefined) return;
  // written over the canvas it pops there; from another tab it lands quietly and the toast says where
  saved = { room, input, how: tab.value === "canvas" ? "pop" : "away" };
  closeSheet();
}
/**
 * The sheet is gone (or its leaving cut short): a memo saved as it closed is placed now, unless
 * another room has been opened meanwhile (its sheet then went with the room, unanswered)
 */
function sheetLeft() {
  const s = saved;
  saved = null;
  if (s !== null && s.room === here.value?.room) place(s.input, s.how);
}
</script>

<template>
  <!--
    Keyed by the room: a room this device kept, opened straight from another one (back, say),
    is in at once, and its tabs are its own, made anew. What a tab holds (a memo being written,
    the trip's settings open, a delete waiting on its second tap, where the desk and the map
    look) is the room's it was opened in, so none of it is carried into the next one. Within
    a room, the tabs are kept alive (KeepAlive) as they are.
  -->
  <InRoom v-if="here !== null" :key="here.room" :room="here.room" :me="here.me" :trip="here.trip">
    <!-- a covered tab is inert: the sheet is the one thing to use -->
    <main :inert="sheet !== null">
      <!-- the tabs are layers in the same box: the one coming up fades in over the one going -->
      <RouterView v-slot="{ Component }">
        <Transition name="ct-fade">
          <KeepAlive><component :is="Component" /></KeepAlive>
        </Transition>
      </RouterView>
    </main>
    <Transition name="ct-slide" @after-leave="sheetLeft" @leave-cancelled="sheetLeft">
      <Form v-if="sheet !== null" :mode="sheet" @close="closeSheet" @save="onSave" />
    </Transition>
    <Connection />
  </InRoom>
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
