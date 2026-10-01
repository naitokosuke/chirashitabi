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
import Canvas, { place } from "./views/Canvas.vue";
import Form from "./views/Form.vue";
import Map from "./views/Map.vue";
import Shiori from "./views/Shiori.vue";

const i18n = useI18n();
const views = computed((): CtOption<View>[] => [
  { value: "canvas", label: i18n.t("nav.canvas") },
  { value: "map", label: i18n.t("nav.map") },
  { value: "shiori", label: i18n.t("nav.booklet") },
]);

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
  <div class="screen">
    <Canvas
      @write="() => send({ type: 'writeRequested' })"
      @edit="(note) => send({ type: 'editRequested', note })"
    />
    <Transition name="ct-morph">
      <Map
        v-if="state.tab === 'map'"
        @write="(pin) => send({ type: 'writeAtPinRequested', pin })"
        @edit="(note) => send({ type: 'editRequested', note })"
      />
    </Transition>
    <Transition name="ct-morph">
      <Shiori v-if="state.tab === 'shiori'" />
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
  <CtTabBar
    class="nav"
    :model-value="state.tab"
    :label="i18n.t('nav.label')"
    :items="views"
    @update:model-value="(tab) => send({ type: 'tabSelected', tab })"
  >
    <template #icon="{ value }">
      <svg
        v-if="value === 'canvas'"
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><rect height="8" rx="1.5" width="8" x="3" y="4" /><rect height="6" rx="1.5" width="8" x="13" y="7" /><rect height="6" rx="1.5" width="9" x="6" y="14" /></svg>
      <svg
        v-else-if="value === 'map'"
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
      <svg
        v-else
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" /></svg>
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
