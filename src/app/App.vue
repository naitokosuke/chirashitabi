<script setup lang="ts" vapor>
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { CtDock, CtDockDivider, CtDockGroup, CtDockItem, type CtOption } from "../ui/index";

import { useI18n } from "./i18n/useI18n";

import type { NoteInput } from "./features/notes/types";
import canvasIcon from "./icons/canvas.svg";
import homeIcon from "./icons/home.svg";
import Icon from "./icons/Icon.vue";
import mapIcon from "./icons/map.svg";
import memoIcon from "./icons/memo.svg";
import shioriIcon from "./icons/shiori.svg";
import tripsIcon from "./icons/trips.svg";
import { LOCAL } from "./features/sync/session";
import { useRoom } from "./features/sync/useRoom";
import Connection from "./features/sync/Connection.vue";
import ThemeSwitch from "./features/theme/ThemeSwitch.vue";
import Toast from "./features/toast/Toast.vue";
import { useToast } from "./features/toast/useToast";
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
const toast = useToast();
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

/** Put out of the room it is showing (removed, left, the room deleted): back to the trips */
watch(
  () => room.gone,
  (g) => {
    const w = where.value;
    if (g !== null && w.kind === "room" && w.room === g.room) void router.replace("/");
  },
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
const opened = ref(new Set<View>());
// immediate: a link may open the app on any tab, not only the first one
watch(
  () => state.value.tab,
  (tab) => opened.value.add(tab),
  { immediate: true },
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
/**
 * The views cross-fade, each a layer that is kept: no snapshot of the screen is taken, so
 * nothing over the views (the dock) is ever pictured, scaled or covered on the way
 */
function selectTab(tab: View) {
  if (tab === state.value.tab && state.value.form === null) return;
  void send({ type: "tabSelected", tab });
}
/** Out to the trips (`/`), which leaves the room; a modified click is left to the browser */
function toTrips(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if (route.path !== "/") void router.push("/");
}
/** A sheet is over the views (a memo's, or a new trip's): the dock steps aside for it */
const covered = computed(
  () => (inRoom.value && state.value.form !== null) || route.path === "/new",
);
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
      :class="['view', { away: state.tab !== 'canvas' }]"
      :inert="!live('canvas')"
      @write="() => send({ type: 'writeRequested' })"
      @edit="(note) => send({ type: 'editRequested', id: note.id })"
    />
    <Home
      v-if="opened.has('home')"
      :class="['view', { away: state.tab !== 'home' }]"
      :inert="!live('home')"
    />
    <!-- the memo tab is the canvas's form, always open: each save goes on the canvas and only there -->
    <Form
      v-if="opened.has('memo')"
      :mode="memoTab"
      :class="['view', { away: state.tab !== 'memo' }]"
      :inert="!live('memo')"
      @save="onMemoSaved"
    />
    <Map
      v-if="opened.has('map')"
      :class="['view', { away: state.tab !== 'map' }]"
      :inert="!live('map')"
      @write="(pin) => send({ type: 'writeAtPinRequested', pin })"
      @edit="(note) => send({ type: 'editRequested', id: note.id })"
    />
    <Shiori
      v-if="opened.has('shiori')"
      :class="['view', { away: state.tab !== 'shiori' }]"
      :inert="!live('shiori')"
    />
    <Transition name="ct-slide">
      <Form v-if="sheet" :mode="sheet" @close="() => send({ type: 'formClosed' })" @save="onSave" />
    </Transition>
  </main>
  <Rooms v-else />
  <!-- out of a room only what has nothing to undo there: being put out of one, say -->
  <Toast v-if="inRoom || toast.current?.undo === undefined" :inert="inRoom && state.form !== null" />
  <Connection v-if="inRoom" />
  <!--
    The one menu, floating over every screen in the same place: the trips, then (in a room)
    its views, folding away on the trips screen, then the theme.
  -->
  <CtDock :label="i18n.t('nav.label')" :away="covered">
    <CtDockItem :label="i18n.t('nav.trips')" :current="!inRoom" href="/" @click="toTrips">
      <Icon :size="22" :src="tripsIcon" />
    </CtDockItem>
    <CtDockGroup :open="inRoom">
      <CtDockItem
        v-for="v in views"
        :key="v.value"
        :label="v.label"
        :current="inRoom && state.tab === v.value"
        @click="() => selectTab(v.value)"
      >
        <Icon :size="22" :src="icons[v.value]" />
      </CtDockItem>
    </CtDockGroup>
    <CtDockDivider />
    <ThemeSwitch />
  </CtDock>
</template>

<style scoped>
main {
  position: absolute;
  inset: 0;
  overflow: hidden;

  /*
   * Kept laid out at full size (the map and the desk measure themselves), just not painted.
   * Opacity too: MapLibre sets `visibility: visible` on its own attribution, which would show
   * through a hidden map. Clicks pass through either way, since the layer is inert.
   */
  /* the one coming up fades in over the one going, which is hidden once it has faded out */
  > .view {
    transition:
      opacity 0.18s ease,
      visibility 0s;
  }

  > .away {
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 0.18s ease,
      visibility 0s 0.18s;

    /*
     * And no part in a View Transition: a named region inside (the booklet's page) would be
     * snapshotted on its own, without this opacity, and show over the view that is up.
     */
    :deep(*) {
      view-transition-name: none;
    }
  }
}
</style>
