<script lang="ts">
import type { Note, NoteInput } from "@/notes/types";

// Module scope is shared with every importer. The canvas is mounted once and
// never unmounted, so one slot is enough.
let placeOnMounted: ((input: NoteInput, quiet: boolean) => Note) | undefined;

/**
 * Put a note at the centre of the canvas and pop it (`quiet`: toast only).
 * `import CanvasView, { place } from "@/canvas/CanvasView.vue"`
 */
export function place(input: NoteInput, quiet = false): Note | undefined {
  return placeOnMounted?.(input, quiet);
}
</script>

<script setup lang="ts" vapor>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { useNotes, ME } from "@/notes/store";
import { useViewport } from "./viewport";
import NoteCard from "./NoteCard.vue";
import FilterBar from "./FilterBar.vue";

const emit = defineEmits<{ write: []; edit: [note: Note] }>();
const store = useNotes();
const { view, clamp, toWorld, zoomAt, animateTo } = useViewport();
const vp = useTemplateRef<HTMLElement>("vp");
const worldStyle = computed(
  () => `transform: translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.s})`,
);

// ---- pointer state: plain variables, never reactive (changes every frame) ----
type Pt = { x: number; y: number };
const pointers = new Map<number, Pt>();
let drag: {
  note: Note;
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  moved: boolean;
  lastSend: number;
} | null = null;
let pan: { x: number; y: number; tx: number; ty: number } | null = null;
let pinch: { dist: number; mid: Pt; s: number; tx: number; ty: number } | null = null;
let pressTimer: number | undefined;
const draggingId = ref<string | null>(null);
const menu = ref<{ note: Note; x: number; y: number } | null>(null);

function noteAt(el: EventTarget | null): Note | undefined {
  const card = (el as HTMLElement).closest?.("[data-id]") as HTMLElement | null;
  return card ? store.byId(card.dataset.id!) : undefined;
}

function onDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest("button")) return;
  menu.value = null;
  vp.value!.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    endDrag();
    clearTimeout(pressTimer);
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      s: view.value.s,
      tx: view.value.tx,
      ty: view.value.ty,
    };
    return;
  }
  const note = noteAt(e.target);
  if (note) {
    const w = toWorld(e.clientX, e.clientY);
    drag = {
      note,
      ox: w.x - note.x,
      oy: w.y - note.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      lastSend: 0,
    };
    pressTimer = window.setTimeout(() => {
      if (drag && !drag.moved) {
        openMenu(note, e.clientX, e.clientY);
        drag = null;
      }
    }, 420);
  } else {
    pan = { x: e.clientX, y: e.clientY, tx: view.value.tx, ty: view.value.ty };
  }
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y),
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ns = clamp((pinch.s * dist) / pinch.dist),
      k = ns / pinch.s;
    view.value.s = ns;
    view.value.tx = mid.x - (pinch.mid.x - pinch.tx) * k;
    view.value.ty = mid.y - (pinch.mid.y - pinch.ty) * k;
    return;
  }
  if (drag) {
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
      drag.moved = true;
      draggingId.value = drag.note.id;
      clearTimeout(pressTimer);
    }
    if (drag.moved) {
      const w = toWorld(e.clientX, e.clientY);
      // throttle network sends to ~12/s; local position updates every frame
      const now = performance.now();
      if (now - drag.lastSend > 80) {
        store.move(drag.note.id, w.x - drag.ox, w.y - drag.oy);
        drag.lastSend = now;
      } else {
        drag.note.x = w.x - drag.ox;
        drag.note.y = w.y - drag.oy;
      }
    }
    return;
  }
  if (pan) {
    view.value.tx = pan.tx + (e.clientX - pan.x);
    view.value.ty = pan.ty + (e.clientY - pan.y);
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  clearTimeout(pressTimer);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  if (drag) {
    if (!drag.moved && e.type === "pointerup" && drag.note.kind !== "claude")
      emit("edit", drag.note);
    else if (drag.moved) store.move(drag.note.id, drag.note.x, drag.note.y, true);
    endDrag();
  }
  pan = null;
}
function endDrag() {
  drag = null;
  draggingId.value = null;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
  else {
    view.value.tx -= e.deltaX;
    view.value.ty -= e.deltaY;
  }
}

// ---- menu ----
function openMenu(note: Note, sx: number, sy: number) {
  navigator.vibrate?.(10);
  const r = vp.value!.getBoundingClientRect();
  menu.value = { note, x: Math.min(sx - 80, r.width - 330), y: Math.max(sy - 70, 90) };
}
function setMenuColor(color: string) {
  if (menu.value) store.update(menu.value.note.id, { color });
}
function duplicateFromMenu() {
  if (menu.value) store.duplicate(menu.value.note.id);
  menu.value = null;
}
function removeFromMenu() {
  if (menu.value) store.remove(menu.value.note.id);
  menu.value = null;
}

// ---- fit ----
function fitAll() {
  const r = vp.value!.getBoundingClientRect();
  const xs = store.notes.map((n) => n.x),
    ys = store.notes.map((n) => n.y);
  const minX = Math.min(...xs) - 30,
    maxX = Math.max(...xs) + 220,
    minY = Math.min(...ys) - 30,
    maxY = Math.max(...ys) + 160;
  const s = clamp(Math.min(r.width / (maxX - minX), (r.height - 200) / (maxY - minY)));
  animateTo((r.width - (maxX + minX) * s) / 2, 120 + (r.height - 200 - (maxY + minY) * s) / 2, s);
}

// ---- adding from the form: place at viewport center, pop ----
const popId = ref<string | null>(null);
const ring = ref<{ x: number; y: number } | null>(null);
const toast = ref<{ text: string; undo?: string } | null>(null);
let toastTimer: number | undefined;
function showToast(text: string, undo?: string) {
  toast.value = { text, undo };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 3200);
}
function undoToast() {
  if (toast.value?.undo) store.remove(toast.value.undo);
  toast.value = null;
}
function write() {
  emit("write");
}
function placeAtCenter(input: NoteInput, quiet: boolean) {
  const r = vp.value!.getBoundingClientRect();
  const c = toWorld(r.width / 2, r.height / 2);
  const n = store.add(input, { x: c.x - 82, y: c.y - 40 });
  if (quiet) {
    showToast(`Added “${n.title}”`, n.id);
    return n;
  }
  popId.value = n.id;
  ring.value = { x: n.x - 14, y: n.y - 14 };
  window.setTimeout(() => {
    popId.value = null;
    ring.value = null;
  }, 900);
  showToast(`Added “${n.title}”. Drag it anywhere`, n.id);
  return n;
}
onMounted(() => (placeOnMounted = placeAtCenter));
onBeforeUnmount(() => (placeOnMounted = undefined));

onMounted(() =>
  nextTick(() => {
    const r = vp.value!.getBoundingClientRect();
    view.value.tx = (r.width - 400) / 2;
    view.value.ty = 90;
  }),
);
</script>

<template>
  <div class="canvas">
    <div
      ref="vp"
      class="viewport"
      :class="{ panning: !!pan }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel="onWheel"
    >
      <div class="world" :style="worldStyle">
        <NoteCard
          v-for="n in store.notes"
          :key="n.id"
          :note="n"
          :dragging="draggingId === n.id"
          :pop="popId === n.id"
          :dim="store.mode === 'dim' && !store.matches(n)"
          :hidden="store.mode === 'only' && !store.matches(n)"
          @adopt="() => store.adopt(n.id)"
          @remove="() => store.remove(n.id)"
        />
        <div v-if="ring" class="ring" :style="`transform: translate(${ring.x}px, ${ring.y}px)`"></div>
      </div>
    </div>

    <FilterBar />

    <div class="jump"><button type="button" @click="fitAll">Fit all</button></div>

    <div v-if="toast" class="toast">
      <span>{{ toast.text }}</span>
      <button v-if="toast.undo" type="button" @click="undoToast">Undo</button>
    </div>

    <div
      v-if="menu"
      class="menu"
      :style="`inset-inline-start:${menu.x}px; inset-block-start:${menu.y}px`"
      @pointerdown.stop
    >
      <button
        v-for="c in store.COLORS"
        :key="c"
        class="sw"
        type="button"
        :class="{ on: menu.note.color === c }"
        :style="`background:${c}`"
        :aria-label="c"
        @click="() => setMenuColor(c)"
      ></button>
      <button type="button" @click="duplicateFromMenu">Duplicate</button>
      <button class="del" type="button" @click="removeFromMenu">Delete</button>
    </div>

    <button aria-label="Write a note" class="fab" type="button" @click="write">
      <svg
        fill="none"
        height="26"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2.5"
        viewBox="0 0 24 24"
        width="26"
      ><path d="M12 5v14M5 12h14" /></svg>
    </button>
  </div>
</template>

<style scoped>
.canvas {
  position: absolute;
  inset: 0;
}

.viewport {
  position: absolute;
  inset: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;
  cursor: grab;
  background-image: radial-gradient(var(--dot) 1.2px, transparent 1.2px);
  background-size: 22px 22px;
  &.panning {
    cursor: grabbing;
  }
}

.world {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.ring {
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  width: 192px;
  height: 110px;
  border: 3px solid var(--red);
  border-radius: 16px;
  pointer-events: none;
  animation: ring .7s ease-out .1s both;
}

@keyframes ring {
  0% {
    transform: scale(.6);
    opacity: .7
  }
  100% {
    transform: scale(1.7);
    opacity: 0
  }
}

.fab {
  position: absolute;
  inset-inline-end: 16px;
  inset-block-end: 20px;
  z-index: var(--z-chrome);
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--red);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(215,38,61,.35);
}

.jump {
  position: absolute;
  inset-inline-start: 16px;
  inset-block-end: 28px;
  z-index: var(--z-chrome);
  & button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1.5px solid var(--line);
    font-size: var(--font-sm);
    font-weight: 700;
  }
}

.toast {
  position: absolute;
  inset-inline: 16px 90px;
  inset-block-end: 92px;
  z-index: var(--z-chrome);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--ink);
  color: var(--bg);
  font-size: var(--font-md);
  font-weight: 700;
  box-shadow: 0 6px 18px rgba(28,34,56,.3);
  & button {
    color: var(--pink-soft);
    font-weight: 700;
    font-size: var(--font-sm);
  }
}

.menu {
  position: absolute;
  z-index: var(--z-menu);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 14px;
  padding: 6px;
  display: flex;
  gap: 4px;
  box-shadow: 0 8px 20px rgba(28,34,56,.2);
  & button {
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: var(--font-md);
    font-weight: 700;
    &.del {
      color: var(--red);
    }
  }
  & .sw {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    margin: 6px 3px;
    border: 2px solid transparent;
    padding: 0;
    min-height: 0;
    &.on {
      border-color: var(--ink);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .ring {
    display: none
  }
}
</style>
