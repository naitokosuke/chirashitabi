<script lang="ts">
import type { Memo } from "./features/notes/types";
import type { LatLng } from "./features/place/types";
import type { FormTarget } from "./views/Form.vue";

export type View = "canvas" | "map" | "shiori";

/** Everything the shell shows: the tab that is up, and the form sheet over it (closed, or open on a target) */
export type AppState = { tab: View; form: FormTarget | null };

/** What can happen to the shell */
export type AppEvent =
  | { type: "tabSelected"; tab: View }
  | { type: "writeRequested" }
  | { type: "writeAtPinRequested"; pin: LatLng }
  | { type: "editRequested"; note: Memo }
  | { type: "formClosed" };

export const initialState: AppState = { tab: "canvas", form: null };

/** The state after an event; pure, so effects such as placing a memo stay with the caller */
export function next(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    case "tabSelected":
      return { ...state, tab: event.tab };
    case "writeRequested":
      return { ...state, form: { kind: "new", pin: null } };
    case "writeAtPinRequested":
      return { ...state, form: { kind: "new", pin: event.pin } };
    case "editRequested":
      return { ...state, form: { kind: "edit", note: event.note } };
    case "formClosed":
      return { ...state, form: null };
  }
}
</script>

<script setup lang="ts" vapor>
import { computed, ref } from "vue";

import { CtTabBar, type CtOption } from "../ui/index";

import { useI18n } from "./i18n/useI18n";

import type { NoteInput } from "./features/notes/types";
import canvasIcon from "./icons/canvas.svg";
import Icon from "./icons/Icon.vue";
import mapIcon from "./icons/map.svg";
import shioriIcon from "./icons/shiori.svg";
import { useRoom } from "./features/sync/useRoom";
import Canvas, { place } from "./views/Canvas.vue";
import Form from "./views/Form.vue";
import Map from "./views/Map.vue";
import Rooms from "./views/Rooms.vue";
import Shiori from "./views/Shiori.vue";

const i18n = useI18n();
const room = useRoom();
/** The room's views only once it has answered; until then, the rooms screen */
const inRoom = computed(() => room.status === "connected" || room.status === "reconnecting");
const views = computed((): CtOption<View>[] => [
  { value: "canvas", label: i18n.t("nav.canvas") },
  { value: "map", label: i18n.t("nav.map") },
  { value: "shiori", label: i18n.t("nav.booklet") },
]);
const icons: Record<View, string> = { canvas: canvasIcon, map: mapIcon, shiori: shioriIcon };

const state = ref<AppState>(initialState);

function send(event: AppEvent) {
  state.value = next(state.value, event);
}
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place(input, true);
    return;
  }
  send({ type: "formClosed" });
  // let the canvas come back first, then pop
  setTimeout(() => place(input), 220);
}
</script>

<template>
  <!-- The canvas stays mounted underneath so pan/zoom survives a trip to the form or the booklet -->
  <div v-if="inRoom" class="screen">
    <!-- a covered layer is inert: no focus, no clicks, no screen-reader path into it -->
    <Canvas
      :inert="state.tab !== 'canvas' || state.form !== null"
      @write="() => send({ type: 'writeRequested' })"
      @edit="(note) => send({ type: 'editRequested', note })"
    />
    <Transition name="ct-morph">
      <Map
        v-if="state.tab === 'map'"
        :inert="state.form !== null"
        @write="(pin) => send({ type: 'writeAtPinRequested', pin })"
        @edit="(note) => send({ type: 'editRequested', note })"
      />
    </Transition>
    <Transition name="ct-morph">
      <Shiori v-if="state.tab === 'shiori'" :inert="state.form !== null" />
    </Transition>
    <Transition name="ct-slide">
      <Form
        v-if="state.form"
        :target="state.form"
        @close="() => send({ type: 'formClosed' })"
        @save="onSave"
      />
    </Transition>
  </div>
  <Rooms v-else @enter="(id) => room.connect(id)" />
  <CtTabBar
    v-if="inRoom"
    class="nav"
    :model-value="state.tab"
    :label="i18n.t('nav.label')"
    :items="views"
    @update:model-value="(tab) => send({ type: 'tabSelected', tab })"
  >
    <template #icon="{ value }">
      <Icon :size="22" :src="icons[value]" />
    </template>
  </CtTabBar>
</template>

<style scoped>
.screen {
  position: absolute;
  inset: 0;
  inset-block-end: var(--navh);
  overflow: hidden;
}

.nav {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  height: var(--navh);
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-block-start: 1.5px solid var(--line);
}
</style>
