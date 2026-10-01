<script setup lang="ts" vapor>
import { ref } from "vue";
import CanvasView from "@/canvas/CanvasView.vue";
import FormView from "@/form/FormView.vue";
import ShioriView from "@/shiori/ShioriView.vue";
import MapView from "@/map/MapView.vue";
import type { Note, NoteInput } from "@/notes/types";

// CanvasView hands this up via @ready (Vize's Vapor output doesn't bind `ref` on components yet)
let place: ((input: NoteInput, quiet?: boolean) => Note) | null = null;
function onCanvasReady(fn: typeof place) {
  place = fn;
}
const tab = ref<"canvas" | "map" | "shiori">("canvas");
const form = ref(false);
const editing = ref<Note | null>(null);
const at = ref<{ lat: number; lng: number } | null>(null);

function write(note: Note | null = null, coords: { lat: number; lng: number } | null = null) {
  editing.value = note;
  at.value = coords;
  form.value = true;
}
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) {
    place?.(input, true);
    return;
  }
  form.value = false;
  // let the canvas come back first, then pop
  setTimeout(() => place?.(input), 220);
}
</script>

<template>
  <!-- The canvas stays mounted underneath so pan/zoom survives a trip to the form or the booklet -->
  <div class="screen">
    <CanvasView @ready="onCanvasReady" @write="write()" @edit="write($event)" />
    <Transition name="fade">
      <MapView v-if="tab === 'map'" @write="write(null, $event)" @edit="write($event)" />
    </Transition>
    <Transition name="fade">
      <ShioriView v-if="tab === 'shiori'" />
    </Transition>
    <Transition name="slide">
      <FormView v-if="form" :editing="editing" :at="at" @close="form = false" @save="onSave" />
    </Transition>
  </div>
  <nav aria-label="ビュー" class="nav">
    <button :class="{ on: tab === 'canvas' }" @click="tab = 'canvas'">
      <svg
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><rect height="8" rx="1.5" width="8" x="3" y="4" /><rect height="6" rx="1.5" width="8" x="13" y="7" /><rect height="6" rx="1.5" width="9" x="6" y="14" /></svg>
      キャンバス
    </button>
    <button :class="{ on: tab === 'map' }" @click="tab = 'map'">
      <svg
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
      地図
    </button>
    <button :class="{ on: tab === 'shiori' }" @click="tab = 'shiori'">
      <svg
        fill="none"
        height="22"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        viewBox="0 0 24 24"
        width="22"
      ><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" /><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" /></svg>
      しおり
    </button>
  </nav>
</template>

<style scoped>
.screen {
  position: absolute;
  inset: 0;
  bottom: var(--navh);
  overflow: hidden;
}

.nav {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--navh);
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1.5px solid var(--line);
}

.nav button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 12px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.nav button.on {
  background: color-mix(in srgb, var(--red) 12%, var(--surface));
  color: var(--red);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active {
    transition: none
  }
}
</style>
