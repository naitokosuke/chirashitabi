<script lang="ts">
import type { Memo } from "./features/notes/types";
import type { LatLng } from "./features/place/types";
import type { FormTarget } from "./views/Form.vue";

export type View = "home" | "canvas" | "memo" | "map" | "shiori";

/** Everything the shell shows: the tab that is up, and the form sheet over it (closed, or open on a target) */
export type AppState = { tab: View; form: FormTarget | null };

/** What can happen to the shell */
export type AppEvent =
  | { type: "tabSelected"; tab: View }
  | { type: "writeRequested" }
  | { type: "writeAtPinRequested"; pin: LatLng | null } // null: from the map's write button, no place yet
  | { type: "editRequested"; note: Memo }
  | { type: "formClosed" };

export const initialState: AppState = { tab: "canvas", form: null };

/** The state after an event; pure, so effects such as placing a memo stay with the caller */
export function next(state: AppState, event: AppEvent): AppState {
  switch (event.type) {
    // the tab bar stays live over the sheet: picking a tab puts the sheet away and goes there
    case "tabSelected":
      return { tab: event.tab, form: null };
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
import { computed, ref, watch } from "vue";

import { CtTabBar, useViewTransition, type CtOption } from "../ui/index";

import { useI18n } from "./i18n/useI18n";

import type { NoteInput } from "./features/notes/types";
import canvasIcon from "./icons/canvas.svg";
import homeIcon from "./icons/home.svg";
import Icon from "./icons/Icon.vue";
import mapIcon from "./icons/map.svg";
import memoIcon from "./icons/memo.svg";
import shioriIcon from "./icons/shiori.svg";
import { useRoom } from "./features/sync/useRoom";
import Toast from "./features/toast/Toast.vue";
import Canvas, { place } from "./views/Canvas.vue";
import Form from "./views/Form.vue";
import Home from "./views/Home.vue";
import Map from "./views/Map.vue";
import Rooms from "./views/Rooms.vue";
import Shiori from "./views/Shiori.vue";

const i18n = useI18n();
const room = useRoom();
/** The room's views only once it has answered; until then, the rooms screen */
const inRoom = computed(() => room.status === "connected" || room.status === "reconnecting");
const views = computed((): CtOption<View>[] => [
  { value: "home", label: i18n.t("nav.home") },
  { value: "canvas", label: i18n.t("nav.canvas") },
  { value: "memo", label: i18n.t("nav.memo") },
  { value: "map", label: i18n.t("nav.map") },
  { value: "shiori", label: i18n.t("nav.booklet") },
]);
const icons: Record<View, string> = {
  home: homeIcon,
  canvas: canvasIcon,
  memo: memoIcon,
  map: mapIcon,
  shiori: shioriIcon,
};

const state = ref<AppState>(initialState);
/** Is this view the one on screen, with nothing covering it? */
const live = (view: View) => state.value.tab === view && state.value.form === null;

/**
 * A view is built the first time it is opened and then kept: coming back to it shows it as
 * it was (the map's tiles, the booklet's scroll), with nothing to load and nothing to fade.
 */
const opened = ref(new Set<View>([initialState.tab]));
watch(
  () => state.value.tab,
  (tab) => opened.value.add(tab),
);

function send(event: AppEvent) {
  state.value = next(state.value, event);
}
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place(input, "quiet");
    return;
  }
  // written over the canvas it pops there; from another tab it lands quietly and the toast says where
  const how = state.value.tab === "canvas" ? "pop" : "away";
  send({ type: "formClosed" });
  // let the sheet leave first, then place
  setTimeout(() => place(input, how), 220);
}
const viewTransition = useViewTransition();
/** The views cross-fade, the screen box being the one region that morphs (`ct-screen`) */
function selectTab(tab: View) {
  if (tab === state.value.tab && state.value.form === null) return;
  viewTransition(() => send({ type: "tabSelected", tab }));
}
/** The memo tab writes a new, unplaced note every time */
const NEW_NOTE: FormTarget = { kind: "new", pin: null };
/** From the memo tab the note lands on the canvas quietly; the toast says so and offers the undo */
function onMemoSaved(input: NoteInput) {
  place(input, "away");
}
</script>

<template>
  <!--
    Every view sits in the same box under the same bar. The canvas is always there (its pan and
    zoom survive anything); the others once opened. Switching only says which one is visible:
    no view is rebuilt, nothing slides, nothing blinks; a View Transition cross-fades the box.
    A hidden or covered view is inert.
  -->
  <div v-if="inRoom" class="screen">
    <Canvas
      :class="{ away: state.tab !== 'canvas' }"
      :inert="!live('canvas')"
      @write="() => send({ type: 'writeRequested' })"
      @edit="(note) => send({ type: 'editRequested', note })"
    />
    <Home v-if="opened.has('home')" :class="{ away: state.tab !== 'home' }" :inert="!live('home')" />
    <!-- the memo tab is the canvas's form, always open: each save goes on the canvas and only there -->
    <Form
      v-if="opened.has('memo')"
      docked
      from="memo"
      :target="NEW_NOTE"
      :active="live('memo')"
      :class="{ away: state.tab !== 'memo' }"
      :inert="!live('memo')"
      @save="onMemoSaved"
    />
    <Map
      v-if="opened.has('map')"
      :class="{ away: state.tab !== 'map' }"
      :inert="!live('map')"
      @write="(pin) => send({ type: 'writeAtPinRequested', pin })"
      @edit="(note) => send({ type: 'editRequested', note })"
    />
    <Shiori
      v-if="opened.has('shiori')"
      :class="{ away: state.tab !== 'shiori' }"
      :inert="!live('shiori')"
    />
    <Transition name="ct-slide">
      <Form
        v-if="state.form"
        :target="state.form"
        :from="state.tab"
        @close="() => send({ type: 'formClosed' })"
        @save="onSave"
      />
    </Transition>
  </div>
  <Rooms v-else @enter="(id) => room.connect(id)" />
  <Toast v-if="inRoom" :inert="state.form !== null" />
  <CtTabBar
    v-if="inRoom"
    class="nav"
    :model-value="state.tab"
    :label="i18n.t('nav.label')"
    :items="views"
    @update:model-value="selectTab"
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
  /* the region that cross-fades when the tab changes (transitions.css) */
  view-transition-name: ct-screen;
}

/*
 * Kept laid out at full size (the map and the desk measure themselves), just not painted.
 * Opacity too: MapLibre sets `visibility: visible` on its own attribution, which would show
 * through a hidden map. Clicks pass through either way, since the layer is inert.
 */
.away {
  visibility: hidden;
  opacity: 0;
  /*
   * And no part in a View Transition: a named region inside (the booklet's page) would be
   * snapshotted on its own, without this opacity, and show over the view that is up.
   */
  & :deep(*) {
    view-transition-name: none !important;
  }
}

.nav {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  height: var(--navh);
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  border-block-start: 1px solid var(--line);
}
</style>
