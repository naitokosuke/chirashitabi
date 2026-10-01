<script setup lang="ts" vapor>
import { ref } from 'vue'
import CanvasView from '@/views/CanvasView.vue'
import FormView from '@/views/FormView.vue'
import ShioriView from '@/views/ShioriView.vue'
import MapView from '@/views/MapView.vue'
import type { Note, NoteInput } from '@/lib/types'

const canvas = ref<{ place: (input: NoteInput, quiet?: boolean) => Note } | null>(null)
const tab = ref<'canvas' | 'map' | 'shiori'>('canvas')
const form = ref(false)
const editing = ref<Note | null>(null)
const at = ref<{ lat: number; lng: number } | null>(null)

function write(note: Note | null = null, coords: { lat: number; lng: number } | null = null) { editing.value = note; at.value = coords; form.value = true }
function onSave(input: NoteInput, keepOpen: boolean) {
  if (keepOpen) { canvas.value?.place(input, true); return }
  form.value = false
  // let the canvas come back first, then pop
  setTimeout(() => canvas.value?.place(input), 220)
}
</script>

<template>
  <!-- The canvas stays mounted underneath so pan/zoom survives a trip to the form or the booklet -->
  <div class="screen">
    <CanvasView ref="canvas" @write="write()" @edit="write($event)" />
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
  <nav class="nav" aria-label="ビュー">
    <button :class="{ on: tab === 'canvas' }" @click="tab = 'canvas'">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="8" height="8" rx="1.5"/><rect x="13" y="7" width="8" height="6" rx="1.5"/><rect x="6" y="14" width="9" height="6" rx="1.5"/></svg>
      キャンバス
    </button>
    <button :class="{ on: tab === 'map' }" @click="tab = 'map'">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>
      地図
    </button>
    <button :class="{ on: tab === 'shiori' }" @click="tab = 'shiori'">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/></svg>
      しおり
    </button>
  </nav>
</template>

<style scoped>
.screen { position: absolute; inset: 0; bottom: var(--navh); overflow: hidden; }
.nav { position: absolute; left: 0; right: 0; bottom: 0; height: var(--navh); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px)); background: var(--surface); border-top: 1.5px solid var(--line); }
.nav button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 12px; color: var(--muted); font-size: 12px; font-weight: 700; }
.nav button.on { background: color-mix(in srgb, var(--red) 12%, var(--surface)); color: var(--red); }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .fade-enter-active, .fade-leave-active { transition: none } }
</style>
