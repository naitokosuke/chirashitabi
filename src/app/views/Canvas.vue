<script lang="ts">
import type { PinchStart } from "../features/canvas/transform";
import type { Memo, Note, NoteInput } from "../features/notes/types";

// Module scope is shared with every importer. The canvas is mounted once and
// never unmounted, so one slot is enough.
let placeOnMounted: ((input: NoteInput, how: PlaceHow) => Memo) | undefined;

/** `pop`: the canvas is in view; `quiet`: the form stays open; `away`: written from another tab */
export type PlaceHow = "pop" | "quiet" | "away";

/**
 * Put a note at the centre of the canvas; the shell's toast confirms it wherever the user is.
 * `import Canvas, { place } from "./Canvas.vue"`
 */
export function place(input: NoteInput, how: PlaceHow = "pop"): Memo | undefined {
  return placeOnMounted?.(input, how);
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
  watch,
} from "vue";

import { CtAppBar, CtFab } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import NoteCard from "../features/canvas/NoteCard.vue";
import { distance, fitView, pinchTo, startPinch, type Pt } from "../features/canvas/transform";
import { useViewport } from "../features/canvas/useViewport";
import { COLOR_NAMES, COLORS, PAPERS, type NoteColor, type NoteId } from "../features/notes/types";
import { useNotes } from "../features/notes/useNotes";
import { useToast } from "../features/toast/useToast";
import FilterBar from "../features/tags/FilterBar.vue";
import { useTags } from "../features/tags/useTags";
import { shortDate } from "../features/trip/format";
import { useTrip } from "../features/trip/useTrip";
import Icon from "../icons/Icon.vue";
import plusIcon from "../icons/plus.svg";

const emit = defineEmits<{ write: []; edit: [note: Memo] }>();
const store = useNotes();
const toast = useToast();
const tags = useTags();
const trip = useTrip();
const i18n = useI18n();
/** "11/3 – 11/6", or nothing while the room has no days */
const dates = computed(() => {
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  if (first === undefined || last === undefined) return "";
  return `${shortDate(first, i18n.locale)} – ${shortDate(last, i18n.locale)}`;
});
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
  // data-id comes back from the DOM as a plain string, so match it rather than trust it
  return card ? store.notes.find((n) => n.id === card.dataset.id) : undefined;
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
  setGesture({
    kind: "press",
    grab: { note, ox: w.x - note.x, oy: w.y - note.y },
    sx: e.clientX,
    sy: e.clientY,
    // only fires while still pressing: moving or lifting clears it
    timer: window.setTimeout(() => {
      setGesture(IDLE);
      openMenu(note);
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

// ---- keyboard: a focused card opens on Enter, its menu on the context-menu key or Shift+F10; Esc closes the menu ----
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && menu.value) {
    closeMenu();
    return;
  }
  const note = noteAt(e.target);
  if (!note || note.kind !== "memo") return;
  if (e.key === "Enter") {
    e.preventDefault();
    emit("edit", note);
  } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
    e.preventDefault();
    openMenu(note);
  }
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
/** Below the card, so the card stays visible while its color is picked; above it near the bottom edge */
function openMenu(note: Note) {
  navigator.vibrate?.(10);
  const r = vp.value!.getBoundingClientRect();
  const card = cardEl(note)?.getBoundingClientRect();
  if (!card) return;
  menu.value = {
    note,
    x: Math.max(8, card.left - r.left),
    y: Math.max(card.bottom - r.top + 8, 8),
  };
  // once it is drawn: measure it, keep it on screen (above the card near the bottom), and move focus in
  nextTick(() => {
    const m = menuEl.value;
    if (!m || !menu.value) return;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const x = Math.max(8, Math.min(card.left - r.left, r.width - w - 8));
    const below = card.bottom - r.top + 8;
    const y = below + h > r.height - 100 ? card.top - r.top - h - 8 : below;
    menu.value = { ...menu.value, x, y: Math.max(y, 8) };
    m.querySelector<HTMLElement>("button")?.focus();
  });
}
const menuEl = useTemplateRef<HTMLElement>("menuEl");
const cardEl = (note: Note) => vp.value?.querySelector<HTMLElement>(`[data-id="${note.id}"]`);
/** Close the menu; focus returns to its card when the keyboard was in the menu */
function closeMenu() {
  const note = menu.value?.note;
  const hadFocus = menuEl.value?.contains(document.activeElement) ?? false;
  menu.value = null;
  if (note && hadFocus) cardEl(note)?.focus();
}
/** Left and right walk the menu's buttons, as in any toolbar; Esc closes it (one handler: two on one element collide) */
function onMenuKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeMenu();
    return;
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const buttons = [...(menuEl.value?.querySelectorAll<HTMLElement>("button") ?? [])];
  const i = buttons.indexOf(document.activeElement as HTMLElement);
  const next = buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
  e.preventDefault();
  next?.focus();
}
function setMenuColor(color: NoteColor) {
  if (menu.value) store.recolor(menu.value.note.id, color);
}
function duplicateFromMenu() {
  if (menu.value) store.duplicate(menu.value.note.id);
  closeMenu();
}
function removeFromMenu() {
  if (menu.value) remove(menu.value.note);
}

// ---- fit ----
function fitAll() {
  const to = fitted();
  if (to) animateTo(to);
}
function fitted(minScale = 0) {
  const r = vp.value!.getBoundingClientRect();
  return fitView(store.notes, r.width, r.height, minScale);
}
/** The first look never shrinks a card past readable; the fit button still shows everything */
const FIRST_LOOK_MIN_SCALE = 0.8;

// ---- adding from the form: place at viewport center, pop ----
/** The card that just landed, and where the ring around it goes */
const pop = ref<{ id: NoteId; x: number; y: number } | null>(null);
/** The shell's toast takes back a note just added */
const undoAdd = (id: NoteId) => ({ undo: () => store.remove(id) });

// ---- deleting: the card leaves at once; the room hears about it once the toast is gone ----
const pendingDelete = ref(new Set<NoteId>());
const shownNotes = computed(() => store.notes.filter((n) => !pendingDelete.value.has(n.id)));
function remove(note: Note) {
  const card = cardEl(note);
  const hadFocus =
    card?.contains(document.activeElement) === true ||
    menuEl.value?.contains(document.activeElement) === true;
  menu.value = null;
  pendingDelete.value.add(note.id);
  toast.show(i18n.t("canvas.deleted", { title: note.title }), {
    undo: () => {
      pendingDelete.value.delete(note.id);
      // the card comes back where the keyboard left it
      if (hadFocus) nextTick(() => cardEl(note)?.focus());
    },
    settle: () => {
      if (pendingDelete.value.delete(note.id)) store.remove(note.id);
    },
  });
  // keyboard users land on the undo, not on the page
  if (hadFocus) nextTick(() => document.querySelector<HTMLElement>(".toast button")?.focus());
}
function write() {
  emit("write");
}
function placeAtCenter(input: NoteInput, how: PlaceHow) {
  const r = vp.value!.getBoundingClientRect();
  const c = toWorld(r.width / 2, r.height / 2);
  const n = store.add(input, { x: c.x - 82, y: c.y - 40 });
  if (how === "pop") {
    pop.value = { id: n.id, x: n.x - 14, y: n.y - 14 };
    window.setTimeout(() => (pop.value = null), 900);
  }
  const message = {
    pop: "canvas.addedDrag",
    quiet: "canvas.added",
    away: "canvas.addedAway",
  } as const;
  toast.show(i18n.t(message[how], { title: n.title }), undoAdd(n.id));
  return n;
}
onMounted(() => (placeOnMounted = placeAtCenter));
onBeforeUnmount(() => (placeOnMounted = undefined));

// The first look shows every card, whatever the screen; an empty desk opens with room to write
onMounted(() =>
  nextTick(() => {
    const r = vp.value!.getBoundingClientRect();
    view.value = fitted(FIRST_LOOK_MIN_SCALE) ?? {
      tx: (r.width - 164) / 2,
      ty: r.height / 2 - 60,
      s: 1,
    };
  }),
);
// Notes that arrive later (the room's first snapshot) get the same first look, once
watch(
  () => store.notes.length > 0,
  (has, had) => {
    if (has && !had) nextTick(() => (view.value = fitted(FIRST_LOOK_MIN_SCALE) ?? view.value));
  },
);
</script>

<template>
  <div class="canvas">
    <CtAppBar><FilterBar /></CtAppBar>

    <div class="desk">
      <!-- where the trip goes, written on the desk itself, under the notes; it stays put while the desk pans -->
      <div class="trip">
        <p class="name">{{ trip.name }}</p>
        <p v-if="dates" class="dates">{{ dates }}</p>
        <p v-if="store.notes.length === 0" class="empty">{{ i18n.t("canvas.empty") }}</p>
      </div>

      <div
        ref="vp"
        class="viewport"
        role="application"
        :aria-label="i18n.t('nav.canvas')"
        :class="{ panning }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel="onWheel"
        @keydown="onKey"
      >
        <div class="world" :style="worldStyle">
          <NoteCard
            v-for="n in shownNotes"
            :key="n.id"
            :note="n"
            :dragging="draggingId === n.id"
            :pop="pop?.id === n.id"
            :visibility="tags.visibility(n)"
            @adopt="() => store.adopt(n.id)"
            @remove="() => remove(n)"
          />
          <div v-if="pop" class="ring" :style="`--x: ${pop.x}px; --y: ${pop.y}px`"></div>
        </div>
      </div>

      <div class="jump"><button type="button" @click="fitAll">{{ i18n.t("common.fitAll") }}</button></div>

      <div
        v-if="menu"
        ref="menuEl"
        class="menu"
        role="toolbar"
        :aria-label="menu.note.title"
        :style="`inset-inline-start:${menu.x}px; inset-block-start:${menu.y}px`"
        @pointerdown.stop
        @keydown="onMenuKey"
      >
        <button
          v-for="c in COLORS"
          :key="c"
          class="sw"
          type="button"
          :class="{ on: menu.note.color === c }"
          :style="`background:${PAPERS[c]}`"
          :aria-label="i18n.t(COLOR_NAMES[c])"
          :aria-pressed="menu.note.color === c"
          @click="() => setMenuColor(c)"
        ></button>
        <button type="button" @click="duplicateFromMenu">{{ i18n.t("canvas.duplicate") }}</button>
        <button class="del" type="button" @click="removeFromMenu">{{ i18n.t("canvas.delete") }}</button>
      </div>

      <CtFab :label="i18n.t('canvas.write')" @click="write"><Icon :size="24" :src="plusIcon" /></CtFab>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  position: absolute;
  inset: 0;
  isolation: isolate; /* keep the canvas chrome's z-index inside this view */
  display: flex;
  flex-direction: column;
}

/* everything under the bar: the dotted desk and what floats on it */
.desk {
  position: relative;
  flex: 1;
  min-height: 0;
}

.viewport {
  position: absolute;
  inset: 0;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  /* clip, not hidden: focusing an off-screen card must not scroll the viewport under the transform */
  overflow: clip;
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
  border: 2px solid color-mix(in oklch, var(--ink) 50%, transparent);
  border-radius: 14px;
  pointer-events: none;
  transform: translate(var(--x), var(--y));
  animation: ring .7s ease-out .1s both;
}

/* every frame keeps the ring's translate: it expands around where the card landed */
@keyframes ring {
  0% {
    transform: translate(var(--x), var(--y)) scale(.6);
    opacity: .7
  }
  100% {
    transform: translate(var(--x), var(--y)) scale(1.7);
    opacity: 0
  }
}

/*
 * The trip's name in the middle of the desk, in the desk's own dot color: big enough to say
 * where this is going, quiet enough that the notes lying over it stay the thing you read.
 */
.trip {
  position: absolute;
  inset-inline: 24px;
  inset-block-start: 50%;
  translate: 0 -50%;
  text-align: center;
  pointer-events: none;
  & p {
    margin: 0;
  }
  & .name {
    font-size: var(--font-display);
    font-weight: 700;
    line-height: 1.2;
    color: color-mix(in oklch, var(--dot) 70%, var(--ink));
    opacity: 0.55;
    overflow-wrap: anywhere;
  }
  & .dates {
    margin-block-start: 4px;
    font-size: var(--font-md);
    font-weight: 700;
    color: var(--muted);
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  /* an empty desk says what to do first, under the name */
  & .empty {
    margin-block-start: 16px;
    color: var(--muted);
    font-size: var(--font-md);
    font-weight: 700;
  }
}

/* level with the write button's middle */
.jump {
  position: absolute;
  inset-inline-start: 16px;
  inset-block-end: 24px;
  z-index: var(--z-chrome);
  & button {
    min-height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-tool);
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
    @media (hover: hover) {
      &:hover {
        color: var(--ink);
      }
    }
  }
}

/* The card's menu: a row of paper colors, then the two actions; wraps on a narrow desk */
.menu {
  position: absolute;
  z-index: var(--z-menu);
  max-width: calc(100% - 16px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  box-shadow: var(--shadow-float);
  & button {
    min-height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: var(--font-md);
    font-weight: 700;
    &.del {
      color: var(--danger);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--wash);
      }
    }
  }
  & .sw {
    width: var(--tap);
    height: var(--tap);
    border-radius: 50%;
    margin: 2px;
    padding: 0;
    min-height: 0;
    /* a hairline keeps white paper visible on the white menu */
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);
    &.on {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .ring {
    display: none
  }
}
</style>
