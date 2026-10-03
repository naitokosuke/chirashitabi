<script lang="ts">
import type { PinchStart } from "../features/canvas/transform";
import type { Memo, NewMemo, Note, NoteInput } from "../features/notes/types";

// Module scope is shared with every importer. The canvas is mounted once and
// never unmounted, so one slot is enough.
let placeOnMounted: ((input: NoteInput, how: PlaceHow) => NewMemo) | undefined;

/** `pop`: the canvas is in view; `quiet`: the form stays open; `away`: written from another tab */
export type PlaceHow = "pop" | "quiet" | "away";

/**
 * Put a note at the centre of the canvas; the shell's toast confirms it wherever the user is.
 * `import Canvas, { place } from "./Canvas.vue"`
 */
export function place(input: NoteInput, how: PlaceHow = "pop"): NewMemo | undefined {
  return placeOnMounted?.(input, how);
}

/** A card held by a finger; (ox, oy) is where on the card it was grabbed */
interface Grab {
  note: Note;
  ox: number;
  oy: number;
}
/** A card's middle on screen, which it turns and grows around */
interface Pivot {
  note: Note;
  cx: number;
  cy: number;
}
/** What the fingers (or the mouse) are doing right now: one thing at a time */
type Gesture =
  | { kind: "idle" }
  /** Down on a card, not moved yet: becomes a drag, a tap (pick; twice, edit) or a long press (menu) */
  | { kind: "press"; grab: Grab; sx: number; sy: number; timer: number }
  | { kind: "drag"; grab: Grab; lastSend: number }
  /** A picked card's corner handle: its size follows the finger's distance from the middle */
  | { kind: "resize"; at: Pivot; d0: number; scale0: number; lastSend: number }
  /** A picked card's top handle: it turns with the finger around the middle */
  | { kind: "rotate"; at: Pivot; a0: number; rot0: number; lastSend: number }
  /** Down on the desk: becomes a pan, or a tap that lets go of the picked card */
  | { kind: "pan"; x: number; y: number; tx: number; ty: number; moved: boolean }
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

import { CtFab } from "../../ui/index";

import { useI18n } from "../i18n/useI18n";

import NoteCard from "../features/canvas/NoteCard.vue";
import {
  distance,
  fitView,
  pinchTo,
  startPinch,
  tagSpot,
  type Pt,
} from "../features/canvas/transform";
import { useViewport } from "../features/canvas/useViewport";
import { COLOR_NAMES, COLORS, PAPERS, type NoteColor, type NoteId } from "../features/notes/types";
import { useNotes, type Shape } from "../features/notes/useNotes";
import { useToast } from "../features/toast/useToast";
import FilterBar from "../features/tags/FilterBar.vue";
import { useTags } from "../features/tags/useTags";
import { shortDate } from "../features/trip/format";
import { useTrip } from "../features/trip/useTrip";
import { OverBudget } from "../features/worker/api";
import { useWorker } from "../features/worker/useWorker";
import { useSuggest } from "../features/worker/useWorkerCalls";
import Icon from "../icons/Icon.vue";
import plusIcon from "../icons/plus.svg";

const emit = defineEmits<{ write: []; edit: [note: Memo] }>();
const store = useNotes();
const toast = useToast();
const worker = useWorker();
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
  // --zoom: the handles on a picked card undo it, to stay the same size on screen
  () =>
    `transform: translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.s}); --zoom: ${view.value.s}`,
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
/** The menu's card as it is now (its color changes while the menu is open) */
const menuNote = computed(() =>
  menu.value === null ? null : (store.byId(menu.value.note.id) ?? menu.value.note),
);

function noteAt(el: EventTarget | null): Note | undefined {
  const card = (el as HTMLElement).closest?.("[data-id]") as HTMLElement | null;
  // data-id comes back from the DOM as a plain string, so match it rather than trust it
  return card ? store.notes.find((n) => n.id === card.dataset.id) : undefined;
}

// ---- picking: a tap picks a card (framed, with handles and its toolbar); two taps open it ----
const selectedId = ref<NoteId | null>(null);
/** The picked card as it is now; a card that went (deleted here or by the partner) is let go */
const selected = computed(() =>
  selectedId.value === null ? null : (store.byId(selectedId.value) ?? null),
);
function select(note: Note | null) {
  selectedId.value = note?.id ?? null;
}
/** The last tap on a card, to tell a second one (open it) from a first (pick it) */
let lastTap: { id: NoteId; at: number } | null = null;
const DOUBLE_TAP_MS = 350;

/** Sizes a card may be drawn at; the room takes 0.5 to 3 (worker/wire.ts) */
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
/** Holding Shift while turning snaps to this many degrees */
const SNAP_DEG = 15;

/** A card's middle on screen: what it turns and grows around (its transform's origin) */
function pivotOf(note: Note): Pivot | null {
  const r = cardEl(note)?.getBoundingClientRect();
  return r ? { note, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null;
}
const angleOf = (at: Pivot, p: Pt) => (Math.atan2(p.y - at.cy, p.x - at.cx) * 180) / Math.PI;
/** Degrees in (-180, 180], so a card turned all the way round is stored as it looks */
const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

function onDown(e: PointerEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("button")) return;
  menu.value = null;
  vp.value!.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // a second finger turns whatever was going on into a pinch; a third is ignored
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    if (pointers.size === 2) setGesture({ kind: "pinch", start: startPinch(view.value, a, b) });
    return;
  }
  const note = noteAt(target);
  if (!note) {
    setGesture({
      kind: "pan",
      x: e.clientX,
      y: e.clientY,
      tx: view.value.tx,
      ty: view.value.ty,
      moved: false,
    });
    return;
  }
  // a handle of the picked card: resize or turn it around its middle
  const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
  const at = handle === undefined ? null : pivotOf(note);
  if (at !== null) {
    const p = { x: e.clientX, y: e.clientY };
    setGesture(
      handle === "resize"
        ? {
            kind: "resize",
            at,
            d0: Math.max(distance(p, { x: at.cx, y: at.cy }), 1),
            scale0: note.scale,
            lastSend: 0,
          }
        : { kind: "rotate", at, a0: angleOf(at, p), rot0: note.rot, lastSend: 0 },
    );
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
      select(note);
      navigator.vibrate?.(10);
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
    // a card that is dragged is the one picked
    select(g.grab.note);
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
    case "resize": {
      const d = distance(p, { x: g.at.cx, y: g.at.cy });
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.scale0 * d) / g.d0));
      return shapeTo(g, { rot: g.at.note.rot, scale });
    }
    case "rotate": {
      const turned = g.rot0 + angleOf(g.at, p) - g.a0;
      const rot = wrap(e.shiftKey ? Math.round(turned / SNAP_DEG) * SNAP_DEG : turned);
      return shapeTo(g, { rot, scale: g.at.note.scale });
    }
    case "pan":
      if (!g.moved && distance(p, { x: g.x, y: g.y }) <= 6) return;
      g.moved = true;
      view.value.tx = g.tx + (p.x - g.x);
      view.value.ty = g.ty + (p.y - g.y);
  }
}
/**
 * A card under a finger (moved, turned or resized) is drawn from here, not from the cache:
 * intermediate states do not belong in the room's data (docs/data-fetching.md). Letting go
 * writes it once.
 */
const held = shallowRef<{ id: NoteId; x: number; y: number; shape?: Shape } | null>(null);
/** The partner sees a held card change at ~12/s; here it follows every frame */
function throttled(g: { lastSend: number }, send: () => void) {
  const now = performance.now();
  if (now - g.lastSend > 80) {
    send();
    g.lastSend = now;
  }
}
function dragTo(g: Drag, p: Pt) {
  const { note, ox, oy } = g.grab;
  const w = toWorld(p.x, p.y);
  const h = { id: note.id, x: w.x - ox, y: w.y - oy };
  held.value = h;
  throttled(g, () => store.sendMove(h.id, h.x, h.y));
}
function shapeTo(g: Extract<Gesture, { kind: "resize" | "rotate" }>, shape: Shape) {
  const { note } = g.at;
  held.value = { id: note.id, x: note.x, y: note.y, shape };
  throttled(g, () => store.sendMove(note.id, note.x, note.y, shape));
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  const g = gesture.value;
  // a pinch lasts until fewer than two fingers are left
  if (g.kind === "pinch" && pointers.size >= 2) return;
  const tapped = e.type === "pointerup";
  if (g.kind === "press" && tapped) tapCard(g.grab.note);
  // a tap on the bare desk lets go of the picked card
  if (g.kind === "pan" && !g.moved && tapped) select(null);
  // let go: the one write of where it landed, how it is turned and how large
  const h = held.value;
  if ((g.kind === "drag" || g.kind === "resize" || g.kind === "rotate") && h !== null)
    store.move(h.id, h.x, h.y, h.shape);
  held.value = null;
  setGesture(IDLE);
}
/** One tap picks the card and shows its toolbar; a second one soon after opens a memo */
function tapCard(note: Note) {
  const now = performance.now();
  if (lastTap !== null && lastTap.id === note.id && now - lastTap.at < DOUBLE_TAP_MS) {
    lastTap = null;
    // suggestions are adopted with their own buttons, not opened
    if (note.kind === "memo") emit("edit", note);
    return;
  }
  lastTap = { id: note.id, at: now };
  select(note);
  openMenu(note, { focus: false });
}

// ---- keyboard: Enter opens a focused card, Delete removes it, the context-menu key or Shift+F10 shows its menu; Esc closes the menu, then lets go ----
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (menu.value) closeMenu();
    else select(null);
    return;
  }
  const note = noteAt(e.target);
  if (!note) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    remove(note);
    return;
  }
  if (note.kind !== "memo") return;
  if (e.key === "Enter") {
    e.preventDefault();
    emit("edit", note);
  } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
    e.preventDefault();
    select(note);
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
/** How far the menu keeps from the card: clear of the picked card's corner and top handles */
const CLEAR = 28;
/** Below the card, so the card stays visible while its color is picked; above it near the bottom edge */
function openMenu(note: Note, { focus = true } = {}) {
  const r = vp.value!.getBoundingClientRect();
  const card = cardEl(note)?.getBoundingClientRect();
  if (!card) return;
  menu.value = {
    note,
    x: Math.max(8, card.left - r.left),
    y: Math.max(card.bottom - r.top + CLEAR, 8),
  };
  // once it is drawn: measure it, keep it on screen (above the card near the bottom), and move focus in
  nextTick(() => {
    const m = menuEl.value;
    if (!m || !menu.value) return;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const x = Math.max(8, Math.min(card.left - r.left, r.width - w - 8));
    const below = card.bottom - r.top + CLEAR;
    // the desk runs under the dock: the floor is the dock's top, less the write button's row
    const dock = document.querySelector("[data-dock]")?.getBoundingClientRect().top ?? r.bottom;
    const floor = Math.min(r.bottom, dock) - r.top - 72;
    const y = below + h > floor ? card.top - r.top - h - CLEAR : below;
    menu.value = { ...menu.value, x, y: Math.max(y, 8) };
    // the keyboard moves into it; a tap that picked the card leaves focus where it was
    if (focus) m.querySelector<HTMLElement>("button")?.focus();
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
  // the trip's tag counts as one more card, so a fit always shows it
  const at = tagAt.value;
  const tag = at === null ? [] : [{ x: at.x - 82, y: at.y - 40 }];
  return fitView([...store.notes, ...tag], r.width, r.height, minScale);
}

// ---- the trip's tag: where the trip goes, an object on the desk that is not a note ----
/** Its middle, in desk coordinates. Set once the desk's notes are known, then left where it is */
const tagAt = shallowRef<Pt | null>(null);
/** Where a new card lands right now: the middle of the view */
function landing(): Pt {
  const r = vp.value!.getBoundingClientRect();
  const c = toWorld(r.width / 2, r.height / 2);
  return { x: c.x, y: c.y };
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
const shownNotes = computed(() =>
  store.notes
    .filter((n) => !pendingDelete.value.has(n.id))
    .map((n) => {
      const h = held.value;
      return h?.id === n.id ? { ...n, x: h.x, y: h.y, ...h.shape } : n;
    }),
);
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
  if (hadFocus)
    nextTick(() => document.querySelector<HTMLElement>('[role="status"] button')?.focus());
}
const { mutateAsync: suggestAt, isLoading: thinking } = useSuggest();
/**
 * The room's agent leaves a few ideas where the person is looking. They arrive as the room's
 * changes, like the partner's cards; the toast says how many, or why none came.
 */
async function askForIdeas() {
  if (thinking.value) return;
  const r = vp.value!.getBoundingClientRect();
  const c = toWorld(r.width / 2, r.height / 2);
  try {
    const n = await suggestAt({ x: c.x, y: c.y });
    toast.show(n === 0 ? i18n.t("canvas.noIdeas") : i18n.t("canvas.ideasAdded", { count: n }));
  } catch (e) {
    const key = !(e instanceof OverBudget)
      ? "canvas.ideasFailed"
      : e.ceiling === "trip"
        ? "canvas.ideasTripLimit"
        : "canvas.ideasLimit";
    toast.show(i18n.t(key));
  }
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

// The wheel is listened to on the desk itself, not with @wheel: Vapor delegates a template's
// handlers to the document, where Chrome makes a wheel listener passive, so preventDefault is
// ignored and a trackpad pinch zooms the whole page instead of the desk
onMounted(() => vp.value!.addEventListener("wheel", onWheel, { passive: false }));
onBeforeUnmount(() => vp.value?.removeEventListener("wheel", onWheel));

// The first look shows every card, whatever the screen; an empty desk opens with room to write
onMounted(() =>
  nextTick(() => {
    const r = vp.value!.getBoundingClientRect();
    if (store.notes.length > 0) {
      tagAt.value = tagSpot(store.notes, landing());
      view.value = fitted(FIRST_LOOK_MIN_SCALE) ?? view.value;
      return;
    }
    view.value = { tx: (r.width - 164) / 2, ty: r.height / 2 - 60, s: 1 };
    tagAt.value = tagSpot([], landing());
  }),
);
// Notes that arrive later (the room's first snapshot) get the same first look, once, and the tag moves over them
watch(
  () => store.notes.length > 0,
  (has, had) => {
    if (!has || had) return;
    nextTick(() => {
      tagAt.value = tagSpot(store.notes, landing());
      view.value = fitted(FIRST_LOOK_MIN_SCALE) ?? view.value;
    });
  },
);
</script>

<template>
  <section>
    <!-- no bar: the desk runs to the top, and what would sit in a bar floats on it -->
    <div>
      <p v-if="store.notes.length === 0">{{ i18n.t("canvas.empty") }}</p>

      <div class="top">
        <FilterBar />
        <button
          v-if="worker.api?.suggest"
          type="button"
          :disabled="thinking"
          :aria-busy="thinking"
          @click="askForIdeas"
        >{{ i18n.t(thinking ? "canvas.thinking" : "canvas.askIdeas") }}</button>
      </div>

      <div
        ref="vp"
        role="application"
        :aria-label="i18n.t('nav.canvas')"
        :data-panning="panning || undefined"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @keydown="onKey"
      >
        <div :style="worldStyle">
          <!-- where the trip goes: a luggage tag lying on the desk, under the notes, panning with them -->
          <div v-if="tagAt !== null" class="tag" :style="`--x: ${tagAt.x}px; --y: ${tagAt.y}px`">
            <span aria-hidden="true"></span>
            <p>{{ trip.name }}</p>
            <p v-if="dates">{{ dates }}</p>
          </div>
          <NoteCard
            v-for="n in shownNotes"
            :key="n.id"
            :note="n"
            :dragging="draggingId === n.id"
            :selected="selected?.id === n.id"
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
        role="toolbar"
        :aria-label="menu.note.title"
        :style="`inset-inline-start:${menu.x}px; inset-block-start:${menu.y}px`"
        @pointerdown.stop
        @keydown="onMenuKey"
      >
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          :style="`background:${PAPERS[c]}`"
          :aria-label="i18n.t(COLOR_NAMES[c])"
          :aria-pressed="menuNote?.color === c"
          @click="() => setMenuColor(c)"
        ></button>
        <button type="button" @click="duplicateFromMenu">{{ i18n.t("canvas.duplicate") }}</button>
        <button type="button" @click="removeFromMenu">{{ i18n.t("canvas.delete") }}</button>
      </div>

      <CtFab :label="i18n.t('canvas.write')" @click="write"><Icon :size="24" :src="plusIcon" /></CtFab>
    </div>
  </section>
</template>

<style scoped>
@import "../../ui/styles/media.css";

section {
  position: absolute;
  inset: 0;
  isolation: isolate; /* keep the canvas chrome's z-index inside this view */
  display: flex;
  flex-direction: column;

  /* the whole view is the dotted desk, and what floats on it */
  > div {
    position: relative;
    flex: 1;
    min-height: 0;

    /*
     * Floating along the top, where a bar would be: the tag filter, and at its end the ask
     * for ideas. Only the controls take touches; the desk between them still pans.
     */
    > .top {
      position: absolute;
      inset-inline: 0;
      inset-block-start: 0;
      z-index: var(--z-chrome);
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: var(--top-row);
      padding: env(safe-area-inset-top, 0px) 12px 0 0;
      pointer-events: none;

      > * {
        pointer-events: auto;
      }

      /* dashed, like the booklet's ask for a draft */
      > button {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: var(--tap);
        padding: 0 12px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px dashed color-mix(in oklch, var(--ink) 30%, var(--line));
        box-shadow: var(--shadow-tool);
        color: var(--ink);
        font-size: var(--font-sm);
        font-weight: 700;
        white-space: nowrap;

        &:disabled {
          color: var(--muted);
        }

        /* waiting on the Worker: a dot breathing before the label */
        &[aria-busy="true"]::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          animation: breathe 1s ease-in-out infinite alternate;

          @media (--reduced-motion) {
            animation: none;
          }
        }
      }
    }

    /* An empty desk says what to do first */
    > p {
      position: absolute;
      inset-inline: 24px;
      inset-block-start: 62%;
      margin: 0;
      text-align: center;
      color: var(--muted);
      font-size: var(--font-md);
      font-weight: 700;
      pointer-events: none;
    }

    > [role="application"] {
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

      &[data-panning] {
        cursor: grabbing;
      }

      /* the world: everything on the desk, panned and zoomed as one */
      > div {
        position: absolute;
        inset-inline-start: 0;
        inset-block-start: 0;
        transform-origin: 0 0;
        will-change: transform;

        /*
         * The trip's tag: a luggage tag in ink, level, with a punched hole and the trip's name. Not
         * paper, so never mistaken for a note: ink instead of a tint, no tilt, a hole instead of a dot.
         * Clicks go through it to the desk, so it pans like the desk does.
         */
        > .tag {
          position: absolute;
          inset-inline-start: 0;
          inset-block-start: 0;
          transform: translate(var(--x), var(--y)) translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          max-width: 320px;
          padding: 12px 22px 12px 40px;
          border-radius: 12px 18px 18px 12px;
          background: var(--ink);
          color: var(--on-ink);
          box-shadow: var(--shadow-paper);
          pointer-events: none;
          white-space: nowrap;

          /* the punched hole */
          > span {
            position: absolute;
            inset-inline-start: 14px;
            inset-block-start: 50%;
            translate: 0 -50%;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--bg);
            box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35);
          }

          > p {
            margin: 0;

            /* the trip's name */
            &:first-of-type {
              font-size: var(--font-4xl);
              font-weight: 700;
              line-height: 1.25;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 100%;
            }

            /* its dates, under the name */
            & + p {
              margin-block-start: 2px;
              font-size: var(--font-sm);
              font-weight: 700;
              opacity: 0.7;
              font-variant-numeric: tabular-nums;
            }
          }
        }

        > .ring {
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

          @media (--reduced-motion) {
            display: none;
          }
        }
      }
    }

    /* level with the write button's middle */
    > .jump {
      position: absolute;
      inset-inline-start: 16px;
      inset-block-end: calc(var(--dock-clear) + 24px);
      z-index: var(--z-chrome);

      > button {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: var(--surface);
        border: 1px solid var(--line);
        box-shadow: var(--shadow-tool);
        font-size: var(--font-sm);
        font-weight: 700;
        color: var(--muted);

        @media (--can-hover) {
          &:hover {
            color: var(--ink);
          }
        }
      }
    }

    /* The card's menu: a row of paper colors, then the two actions; wraps on a narrow desk */
    > [role="toolbar"] {
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

      > button {
        min-height: 40px;
        padding: 0 12px;
        border-radius: 10px;
        font-size: var(--font-md);
        font-weight: 700;

        /* delete, the last action */
        &:last-child {
          color: var(--danger);
        }

        @media (--can-hover) {
          &:hover {
            background: var(--wash);
          }
        }

        /* a paper color: the only buttons with a pressed state */
        &[aria-pressed] {
          width: var(--tap);
          height: var(--tap);
          border-radius: 50%;
          margin: 2px;
          padding: 0;
          min-height: 0;
          /* a hairline keeps white paper visible on the white menu */
          box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--paper-ink) 14%, transparent);

          &[aria-pressed="true"] {
            outline: 2px solid var(--ink);
            outline-offset: 2px;
          }
        }
      }
    }
  }
}

/* every frame keeps the ring's translate: it expands around where the card landed */
@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}

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
</style>
