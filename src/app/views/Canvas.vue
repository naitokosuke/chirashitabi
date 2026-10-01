<script lang="ts">
import type { Memo, Note, NoteInput } from "@/features/notes/types";
import type { PinchStart } from "@/features/canvas/transform";

// Module scope is shared with every importer. The canvas is mounted once and
// never unmounted, so one slot is enough.
let placeOnMounted: ((input: NoteInput, quiet: boolean) => Memo) | undefined;

/**
 * Put a note at the centre of the canvas and pop it (`quiet`: toast only).
 * `import Canvas, { place } from "@/views/Canvas.vue"`
 */
export function place(input: NoteInput, quiet = false): Memo | undefined {
  return placeOnMounted?.(input, quiet);
}

/** A card held by a finger; (ox, oy) is where on the card it was grabbed */
interface Grab {
  note: Note;
  ox: number;
  oy: number;
}
/** What the fingers (or the mouse) are doing right now: one thing at a time */
type Gesture =
  | { kind: "idle" }
  /** Down on a card, not moved yet: becomes a drag, a tap (edit) or a long press (menu) */
  | { kind: "press"; grab: Grab; sx: number; sy: number; timer: number }
  | { kind: "drag"; grab: Grab; lastSend: number }
  | { kind: "pan"; x: number; y: number; tx: number; ty: number }
  | { kind: "pinch"; start: PinchStart };
type Drag = Extract<Gesture, { kind: "drag" }>;
const IDLE: Gesture = { kind: "idle" };
</script>

<script setup lang="ts" vapor>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
} from "vue";
import { useNotes } from "@/features/notes/store";
import { COLORS } from "@/features/notes/types";
import { useTags } from "@/features/tags/store";
import { useTrip } from "@/features/trip/store";
import { useViewport } from "@/features/canvas/viewport";
import { distance, fitView, pinchTo, startPinch, type Pt } from "@/features/canvas/transform";
import NoteCard from "@/features/canvas/NoteCard.vue";
import FilterBar from "@/features/tags/FilterBar.vue";

const emit = defineEmits<{ write: []; edit: [note: Memo] }>();
const store = useNotes();
const tags = useTags();
const trip = useTrip();
const { view, toWorld, zoomAt, animateTo } = useViewport();
const vp = useTemplateRef<HTMLElement>("vp");
const worldStyle = computed(
  () => `transform: translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.s})`,
);

// ---- pointer state ----
// Where each finger is: plain, never reactive (changes every frame)
const pointers = new Map<number, Pt>();
// Shallow: the gesture is replaced when it changes kind; its fields are
// mutated in place every frame without triggering anything.
const gesture = shallowRef<Gesture>(IDLE);
/** Change gestures; leaving a press cancels its long-press timer */
function setGesture(next: Gesture) {
  const g = gesture.value;
  if (g.kind === "press") clearTimeout(g.timer);
  gesture.value = next;
}
const draggingId = computed(() =>
  gesture.value.kind === "drag" ? gesture.value.grab.note.id : null,
);
const panning = computed(() => gesture.value.kind === "pan");
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
  // a second finger turns whatever was going on into a pinch; a third is ignored
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    if (pointers.size === 2) setGesture({ kind: "pinch", start: startPinch(view.value, a, b) });
    return;
  }
  const note = noteAt(e.target);
  if (!note) {
    setGesture({ kind: "pan", x: e.clientX, y: e.clientY, tx: view.value.tx, ty: view.value.ty });
    return;
  }
  const w = toWorld(e.clientX, e.clientY);
  const [sx, sy] = [e.clientX, e.clientY];
  setGesture({
    kind: "press",
    grab: { note, ox: w.x - note.x, oy: w.y - note.y },
    sx,
    sy,
    // only fires while still pressing: moving or lifting clears it
    timer: window.setTimeout(() => {
      setGesture(IDLE);
      openMenu(note, sx, sy);
    }, 420),
  });
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const p = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, p);
  let g = gesture.value;
  if (g.kind === "press" && distance(p, { x: g.sx, y: g.sy }) > 6) {
    g = { kind: "drag", grab: g.grab, lastSend: 0 };
    setGesture(g);
  }
  switch (g.kind) {
    case "pinch": {
      const [a, b] = [...pointers.values()];
      view.value = pinchTo(g.start, a, b);
      return;
    }
    case "drag":
      return dragTo(g, p);
    case "pan":
      view.value.tx = g.tx + (p.x - g.x);
      view.value.ty = g.ty + (p.y - g.y);
  }
}
function dragTo(g: Drag, p: Pt) {
  const { note, ox, oy } = g.grab;
  const w = toWorld(p.x, p.y);
  // throttle network sends to ~12/s; local position updates every frame
  const now = performance.now();
  if (now - g.lastSend > 80) {
    store.move(note.id, w.x - ox, w.y - oy);
    g.lastSend = now;
  } else {
    note.x = w.x - ox;
    note.y = w.y - oy;
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  const g = gesture.value;
  // a pinch lasts until fewer than two fingers are left
  if (g.kind === "pinch" && pointers.size >= 2) return;
  // a tap on a memo opens it; suggestions are adopted with their own buttons
  if (g.kind === "press" && e.type === "pointerup" && g.grab.note.kind === "memo")
    emit("edit", g.grab.note);
  if (g.kind === "drag") store.move(g.grab.note.id, g.grab.note.x, g.grab.note.y, true);
  setGesture(IDLE);
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
  if (menu.value) store.recolor(menu.value.note.id, color);
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
  const to = fitView(store.notes, r.width, r.height);
  if (to) animateTo(to);
}

// ---- adding from the form: place at viewport center, pop ----
/** The card that just landed, and where the ring around it goes */
const pop = ref<{ id: string; x: number; y: number } | null>(null);
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
  pop.value = { id: n.id, x: n.x - 14, y: n.y - 14 };
  window.setTimeout(() => (pop.value = null), 900);
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
      :class="{ panning }"
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
          :pop="pop?.id === n.id"
          :visibility="tags.visibility(n)"
          @adopt="() => store.adopt(n.id)"
          @remove="() => store.remove(n.id)"
        />
        <div v-if="pop" class="ring" :style="`transform: translate(${pop.x}px, ${pop.y}px)`"></div>
      </div>
    </div>

    <FilterBar :room="trip.name" />

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
        v-for="c in COLORS"
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
  isolation: isolate; /* keep the canvas chrome's z-index inside this view */
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
