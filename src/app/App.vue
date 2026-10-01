<script setup lang="ts" vapor>
import { ref } from "vue";
import Canvas, { place } from "@/views/Canvas.vue";
import Form from "@/views/Form.vue";
import Shiori from "@/views/Shiori.vue";
import Map from "@/views/Map.vue";
import type { Note, NoteInput } from "@/features/notes/types";
import { CtTabBar, type CtOption } from "@ui/index";

const VIEWS = [
  { value: "canvas", label: "Canvas" },
  { value: "map", label: "Map" },
  { value: "shiori", label: "Booklet" },
] as const satisfies readonly CtOption[];
type View = (typeof VIEWS)[number]["value"];
const isView = (v: string): v is View => VIEWS.some((view) => view.value === v);

const tab = ref<View>("canvas");
const form = ref(false);
const editing = ref<Note | null>(null);
const at = ref<{ lat: number; lng: number } | null>(null);

function write(note: Note | null = null, coords: { lat: number; lng: number } | null = null) {
  editing.value = note;
  at.value = coords;
  form.value = true;
}
function newNote() {
  write();
}
function editNote(note: Note) {
  write(note);
}
function writeAt(coords: { lat: number; lng: number }) {
  write(null, coords);
}
function closeForm() {
  form.value = false;
}
function showTab(v: string) {
  if (isView(v)) tab.value = v;
}
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place(input, true);
    return;
  }
  form.value = false;
  // let the canvas come back first, then pop
  setTimeout(() => place(input), 220);
}
</script>

<template>
  <!-- The canvas stays mounted underneath so pan/zoom survives a trip to the form or the booklet -->
  <div class="screen">
    <Canvas @write="newNote" @edit="editNote" />
    <Transition name="ct-morph">
      <Map v-if="tab === 'map'" @write="writeAt" @edit="editNote" />
    </Transition>
    <Transition name="ct-morph">
      <Shiori v-if="tab === 'shiori'" />
    </Transition>
    <Transition name="ct-slide">
      <Form v-if="form" :editing :at @close="closeForm" @save="onSave" />
    </Transition>
  </div>
  <CtTabBar class="nav" label="Views" :items="VIEWS" :model-value="tab" @update:model-value="showTab">
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
