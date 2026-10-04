<script setup lang="ts" vapor>
import { computed } from "vue";

import { useRoute, useRouter } from "vue-router";

import { CtDock, CtDockDivider, CtDockGroup, CtDockItem, type CtOption } from "../ui/index";

import { useI18n } from "./i18n/useI18n";

import { useSync } from "./features/sync/useSync";
import ThemeSwitch from "./features/theme/ThemeSwitch.vue";
import Toast from "./features/toast/Toast.vue";
import { useToast } from "./features/toast/useToast";
import canvasIcon from "./icons/canvas.svg";
import homeIcon from "./icons/home.svg";
import Icon from "./icons/Icon.vue";
import mapIcon from "./icons/map.svg";
import memoIcon from "./icons/memo.svg";
import shioriIcon from "./icons/shiori.svg";
import tripsIcon from "./icons/trips.svg";
import { queryStrings, sheetOf, viewOf, type View } from "./pages/rooms/url";

/**
 * Every page (pages/, router.ts) under the one menu, which floats over every screen in the same
 * place, and the toast. A room's page draws its tabs and its sheet itself.
 */
const i18n = useI18n();
const sync = useSync();
const toast = useToast();
const router = useRouter();
const route = useRoute();

/** The room's tab the URL is on, while this device is in that room; null otherwise */
const tab = computed(() => {
  const s = sync.session;
  if (!("roomId" in route.params) || s.kind !== "in" || s.room !== route.params.roomId) return null;
  return viewOf(route.name);
});
const inRoom = computed(() => tab.value !== null);
/** A sheet is over the room's tab */
const sheetOpen = computed(() => inRoom.value && sheetOf(queryStrings(route.query)) !== null);

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

/**
 * A tab replaces the step it is on, so back leaves the room rather than walking through every
 * tab seen; picking one puts a sheet away. The tabs cross-fade on their own (the room's page):
 * no View Transition, which would picture the whole screen, dock and all, and move it on the way.
 */
function selectTab(view: View) {
  if (!("roomId" in route.params) || (view === tab.value && !sheetOpen.value)) return;
  void router.replace({
    name: `/rooms/[roomId]/${view}` as const,
    params: { roomId: route.params.roomId },
  });
}
/** Out to the trips (`/`), which leaves the room; a modified click is left to the browser */
function toTrips(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if (route.path !== "/") void router.push("/");
}
/** A sheet is over the page (a memo's, or a new trip's): the menu steps aside for it */
const covered = computed(() => sheetOpen.value || route.name === "/new");
</script>

<template>
  <RouterView />
  <!-- out of a room only what has nothing to undo there: being put out of one, say -->
  <Toast v-if="inRoom || toast.current?.undo === undefined" :inert="sheetOpen" />
  <!-- the trips, then (in a room) its tabs, folding away on the trips screen, then the theme -->
  <CtDock :label="i18n.t('nav.label')" :away="covered">
    <CtDockItem :label="i18n.t('nav.trips')" :current="!inRoom" href="/" @click="toTrips">
      <Icon :size="22" :src="tripsIcon" />
    </CtDockItem>
    <CtDockGroup :open="inRoom">
      <CtDockItem
        v-for="v in views"
        :key="v.value"
        :label="v.label"
        :current="tab === v.value"
        @click="() => selectTab(v.value)"
      >
        <Icon :size="22" :src="icons[v.value]" />
      </CtDockItem>
    </CtDockGroup>
    <CtDockDivider />
    <ThemeSwitch />
  </CtDock>
</template>
