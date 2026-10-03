<script setup lang="ts" vapor>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { CtTabBar, useViewTransition, type CtOption } from "../ui/index";

import { useI18n } from "./i18n/useI18n";

import type { NoteInput } from "./features/notes/types";
import canvasIcon from "./icons/canvas.svg";
import homeIcon from "./icons/home.svg";
import Icon from "./icons/Icon.vue";
import mapIcon from "./icons/map.svg";
import memoIcon from "./icons/memo.svg";
import shioriIcon from "./icons/shiori.svg";
import { LOCAL } from "./features/sync/session";
import { useRoom } from "./features/sync/useRoom";
import Connection from "./features/sync/Connection.vue";
import Toast from "./features/toast/Toast.vue";
import Canvas, { place } from "./views/Canvas.vue";
import Form from "./views/Form.vue";
import Home from "./views/Home.vue";
import Map from "./views/Map.vue";
import Rooms from "./views/Rooms.vue";
import Shiori from "./views/Shiori.vue";
import type { FormMode } from "./views/Form.vue";
import { initialState, locationOf, next, placeOf, type AppEvent, type View } from "./shell";

const i18n = useI18n();
const room = useRoom();
const router = useRouter();
const route = useRoute();

/** Where the app is: what the URL says (shell.ts, router.ts) */
const where = computed(() =>
  placeOf({
    path: route.path,
    query: Object.fromEntries(
      Object.entries(route.query).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
    ),
  }),
);
/** The URL names the room to be in: going to one enters it, going back to the trips leaves it */
watch(
  where,
  (w) => {
    const s = room.session;
    if (w.kind === "room") {
      if (w.room !== LOCAL && (s.kind === "out" || s.room !== w.room)) room.connect(w.room);
    } else if (s.kind !== "out" && s.room !== LOCAL) room.leave();
  },
  { immediate: true },
);

/**
 * The room's views once this device is in the room the URL names (session.ts): when the room
 * has answered, or at once with what this device kept of it, which stays open if the room
 * cannot be reached. Until then, the rooms screen.
 */
const inRoom = computed(() => room.session.kind === "in" && where.value.kind === "room");
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

/** The room's tab and sheet, as the URL has them */
const state = computed(() => (where.value.kind === "room" ? where.value.state : initialState));
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

/**
 * What happens to the shell goes into the URL. Opening a sheet is a step of its own, so back
 * closes it; a tab replaces the step it is on, so back leaves the room rather than walking
 * through every tab seen.
 */
function send(event: AppEvent) {
  const w = where.value;
  if (w.kind !== "room") return Promise.resolve();
  const to = locationOf({ ...w, state: next(w.state, event) });
  if (event.type === "formClosed") {
    // the sheet's own step: going back is closing it, and leaves nothing to go forward to
    const back = (window.history.state as { back?: unknown } | null)?.back;
    if (back === router.resolve(to).fullPath) {
      router.back();
      return Promise.resolve();
    }
    return router.replace(to);
  }
  return event.type === "tabSelected" ? router.replace(to) : router.push(to);
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
/** The memo tab is the form itself, live while the tab is up */
const memoTab = computed((): FormMode => ({ kind: "tab", active: live("memo") }));
/** The one sheet, over the tab it was opened from, while it is open */
const sheet = computed((): FormMode | null =>
  state.value.form === null
    ? null
    : { kind: "sheet", target: state.value.form, from: state.value.tab },
);
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
  <main v-if="inRoom">
    <Canvas
      :class="{ away: state.tab !== 'canvas' }"
      :inert="!live('canvas')"
      @write="() => send({ type: 'writeRequested' })"
      @edit="(note) => send({ type: 'editRequested', id: note.id })"
    />
    <Home v-if="opened.has('home')" :class="{ away: state.tab !== 'home' }" :inert="!live('home')" />
    <!-- the memo tab is the canvas's form, always open: each save goes on the canvas and only there -->
    <Form
      v-if="opened.has('memo')"
      :mode="memoTab"
      :class="{ away: state.tab !== 'memo' }"
      :inert="!live('memo')"
      @save="onMemoSaved"
    />
    <Map
      v-if="opened.has('map')"
      :class="{ away: state.tab !== 'map' }"
      :inert="!live('map')"
      @write="(pin) => send({ type: 'writeAtPinRequested', pin })"
      @edit="(note) => send({ type: 'editRequested', id: note.id })"
    />
    <Shiori
      v-if="opened.has('shiori')"
      :class="{ away: state.tab !== 'shiori' }"
      :inert="!live('shiori')"
    />
    <Transition name="ct-slide">
      <Form v-if="sheet" :mode="sheet" @close="() => send({ type: 'formClosed' })" @save="onSave" />
    </Transition>
  </main>
  <Rooms v-else />
  <Toast v-if="inRoom" :inert="state.form !== null" />
  <Connection v-if="inRoom" />
  <CtTabBar
    v-if="inRoom"
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
main {
  position: absolute;
  inset: 0;
  inset-block-end: var(--navh);
  overflow: hidden;
  /* the region that cross-fades when the tab changes (transitions.css) */
  view-transition-name: ct-screen;

  /*
   * Kept laid out at full size (the map and the desk measure themselves), just not painted.
   * Opacity too: MapLibre sets `visibility: visible` on its own attribution, which would show
   * through a hidden map. Clicks pass through either way, since the layer is inert.
   */
  > .away {
    visibility: hidden;
    opacity: 0;

    /*
     * And no part in a View Transition: a named region inside (the booklet's page) would be
     * snapshotted on its own, without this opacity, and show over the view that is up.
     */
    :deep(*) {
      view-transition-name: none;
    }
  }
}

nav {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  height: var(--navh);
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  border-block-start: 1px solid var(--line);
}
</style>
