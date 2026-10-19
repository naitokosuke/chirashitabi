<script lang="ts">
import type { PinchStart } from "../../../features/canvas/transform";
import type { Note } from "../../../features/notes/types";

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
import type { Temporal } from "temporal-polyfill-lite";

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from "vue";

import { useRoute, useRouter } from "vue-router";

import { CtButton, CtFab } from "../../../../ui/index";

import { useI18n } from "../../../i18n/useI18n";

import NoteCard from "../../../features/canvas/NoteCard.vue";
import TextField from "../../../features/canvas/TextField.vue";
import {
  distance,
  fitView,
  pinchTo,
  startPinch,
  type Pt,
} from "../../../features/canvas/transform";
import {
  FIRST_LOOK_MIN_SCALE,
  firstLook,
  useCanvasPlace,
  type PlaceHow,
} from "../../../features/canvas/usePlace";
import { useViewport } from "../../../features/canvas/useViewport";
import type { NoteId } from "../../../features/notes/id";
import { shrinkImage, STICKER_SIDE } from "../../../features/notes/image";
import { blankInput } from "../../../features/notes/input";
import { siteOf } from "../../../features/notes/links";
import { type FormTarget, type NoteInput, type TextBox } from "../../../features/notes/types";
import { useNotes, type Shape } from "../../../features/notes/useNotes";
import {
  httpUrl,
  isShortMapsLink,
  placeFromUrl,
  type HttpUrl,
} from "../../../features/place/google-maps";
import { useOffline } from "../../../features/sync/useOffline";
import FilterBar from "../../../features/tags/FilterBar.vue";
import { useTags } from "../../../features/tags/useTags";
import { useToast } from "../../../features/toast/useToast";
import { shortDate } from "../../../features/trip/format";
import { assignTo } from "../../../features/trip/itinerary";
import { useTrip } from "../../../features/trip/useTrip";
import { useWorker } from "../../../features/worker/useWorker";
import { useWorkerCalls } from "../../../features/worker/useWorkerCalls";
import Icon from "../../../icons/Icon.vue";
import plusIcon from "../../../icons/plus.svg";
import stickerIcon from "../../../icons/sticker.svg";
import { queryOf } from "../url";

const route = useRoute("/rooms/[roomId=roomId]/canvas");
const router = useRouter();
/** A sheet over the canvas: a step of its own, so back closes it */
const openSheet = (form: FormTarget) =>
  router.push({
    name: "/rooms/[roomId=roomId]/canvas",
    params: { roomId: route.params.roomId, ...queryOf(form) },
  });
const store = useNotes();
const { notes } = store;
const toast = useToast();
const worker = useWorker();
const tags = useTags();
const { trip } = useTrip();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
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
const menuNote = computed(() => {
  const m = menu.value;
  return m === null ? null : (notes.value?.find((n) => n.id === m.note.id) ?? m.note);
});

function noteAt(el: EventTarget | null): Note | undefined {
  const card = el instanceof Element ? el.closest("[data-id]") : null;
  // data-id comes back from the DOM as a plain string, so match it rather than trust it
  return card instanceof HTMLElement
    ? notes.value?.find((n) => n.id === card.dataset.id)
    : undefined;
}

// ---- picking: a tap picks a card (framed, with handles and its toolbar); two taps open it ----
const selectedId = ref<NoteId | null>(null);
/** The picked card as it is now; a card that went (deleted here or by the partner) is let go */
const selected = computed(() =>
  selectedId.value === null ? null : (notes.value?.find((n) => n.id === selectedId.value) ?? null),
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
  return r === undefined ? null : { note, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}
const angleOf = (at: Pivot, p: Pt) => (Math.atan2(p.y - at.cy, p.x - at.cx) * 180) / Math.PI;
/** Degrees in (-180, 180], so a card turned all the way round is stored as it looks */
const wrap = (deg: number) => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

function onDown(e: PointerEvent) {
  const target = e.target;
  // a button, or words being written on the desk, is not the desk
  if (!(target instanceof Element) || target.closest("button, textarea") !== null) return;
  menu.value = null;
  vp.value?.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // a second finger turns whatever was going on into a pinch; a third is ignored
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    if (pointers.size === 2 && a !== undefined && b !== undefined)
      setGesture({ kind: "pinch", start: startPinch(view.value, a, b) });
    return;
  }
  const note = noteAt(target);
  if (note === undefined) {
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
      if (a !== undefined && b !== undefined) view.value = pinchTo(g.start, a, b);
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
const held = shallowRef<
  | ({ id: NoteId; x: number; y: number } & ({ kind: "move" } | { kind: "shape"; shape: Shape }))
  | null
>(null);
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
  const h = { kind: "move" as const, id: note.id, x: w.x - ox, y: w.y - oy };
  held.value = h;
  throttled(g, () => store.sendMove(h.id, h.x, h.y));
}
function shapeTo(g: Extract<Gesture, { kind: "resize" | "rotate" }>, shape: Shape) {
  const { note } = g.at;
  held.value = { kind: "shape", id: note.id, x: note.x, y: note.y, shape };
  throttled(g, () => store.sendMove(note.id, note.x, note.y, shape));
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  const g = gesture.value;
  // a pinch lasts until fewer than two fingers are left
  if (g.kind === "pinch" && pointers.size >= 2) return;
  const tapped = e.type === "pointerup";
  if (g.kind === "press" && tapped) tapCard(g.grab.note);
  // a tap on the bare desk lets go of the picked card; a second one there writes on the desk
  if (g.kind === "pan" && !g.moved && tapped) tapDesk(e);
  // let go: the one write of where it landed, how it is turned and how large
  const h = held.value;
  if ((g.kind === "drag" || g.kind === "resize" || g.kind === "rotate") && h !== null)
    store.move(h.id, h.x, h.y, h.kind === "shape" ? h.shape : undefined);
  held.value = null;
  setGesture(IDLE);
}
/** One tap picks the card and shows its toolbar; a second one soon after opens it */
function tapCard(note: Note) {
  const now = performance.now();
  if (lastTap !== null && lastTap.id === note.id && now - lastTap.at < DOUBLE_TAP_MS) {
    lastTap = null;
    // a memo opens in the form, a text box is rewritten where it is; suggestions are adopted
    // with their own buttons, not opened
    if (note.kind === "memo") void openSheet({ kind: "edit", id: note.id });
    else if (note.kind === "text") rewrite(note);
    return;
  }
  lastTap = { id: note.id, at: now };
  select(note);
  openMenu(note, { focus: false });
}

// ---- keyboard: Enter opens a focused card, Delete removes it, the context-menu key or Shift+F10 shows its menu; Esc closes the menu, then lets go ----
function onKey(e: KeyboardEvent) {
  // words being written take their own keys (TextField)
  if (e.target instanceof Element && e.target.closest("textarea") !== null) return;
  if (e.key === "Escape") {
    if (menu.value !== null) closeMenu();
    else select(null);
    return;
  }
  const note = noteAt(e.target);
  if (note === undefined) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    remove(note);
    return;
  }
  if (note.kind === "suggestion") return;
  if (e.key === "Enter") {
    e.preventDefault();
    if (note.kind === "memo") void openSheet({ kind: "edit", id: note.id });
    else if (note.kind === "text") rewrite(note);
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
  const r = vp.value?.getBoundingClientRect();
  if (r === undefined) return;
  const card = cardEl(note)?.getBoundingClientRect();
  if (card === undefined) return;
  menu.value = {
    note,
    x: Math.max(8, card.left - r.left),
    y: Math.max(card.bottom - r.top + CLEAR, 8),
  };
  // once it is drawn: measure it, keep it on screen (above the card near the bottom), and move focus in
  void nextTick(() => {
    const m = menuEl.value;
    if (m === null || menu.value === null) return;
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
  if (note !== undefined && hadFocus) cardEl(note)?.focus();
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
  const i = buttons.findIndex((b) => b === document.activeElement);
  const next = buttons[(i + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
  e.preventDefault();
  next?.focus();
}
/** The menu's card when it is a memo, the only kind that goes on a day */
const menuMemo = computed(() => (menuNote.value?.kind === "memo" ? menuNote.value : null));
/** Put the menu's memo on a day, or take it off; the menu stays, so another day is one tap */
function setMenuDay(date: Temporal.PlainDate | null) {
  const n = menuMemo.value;
  if (n !== null) store.update(n.id, assignTo(n, date));
}
const onMenuDay = (date: Temporal.PlainDate) =>
  menuMemo.value?.schedule?.date.equals(date) ?? false;
function duplicateFromMenu() {
  if (menu.value !== null) store.duplicate(menu.value.note.id);
  closeMenu();
}
function rewriteFromMenu() {
  const n = menuNote.value;
  if (n?.kind === "text") rewrite(n);
}
function removeFromMenu() {
  if (menu.value !== null) remove(menu.value.note);
}

// ---- fit ----
function fitAll() {
  const to = fitted();
  if (to !== null) animateTo(to);
}
function fitted(minScale = 0) {
  const r = vp.value?.getBoundingClientRect();
  if (r === undefined) return null;
  return fitView(notes.value ?? [], r.width, r.height, minScale);
}

// ---- writing on the desk: a double click on it, or on a text box, writes there ----
/** Words being written: a new text box (no id) or one being rewritten, and where they sit */
const writing = shallowRef<{
  id: NoteId | null;
  x: number;
  y: number;
  rot: number;
  scale: number;
  text: string;
} | null>(null);
/** The last tap on the bare desk, to tell a double one */
let lastDeskTap: ({ at: number } & Pt) | null = null;
/** How far apart two taps may land and still be one double tap */
const DOUBLE_TAP_PX = 24;
function tapDesk(e: PointerEvent) {
  const now = performance.now();
  const p = { x: e.clientX, y: e.clientY };
  const last = lastDeskTap;
  lastDeskTap = { at: now, ...p };
  if (last === null || now - last.at >= DOUBLE_TAP_MS || distance(last, p) > DOUBLE_TAP_PX) {
    select(null);
    return;
  }
  lastDeskTap = null;
  // the caret lands about where the click did: the box's corner a little up and to the left
  const w = toWorld(p.x, p.y);
  writing.value = { id: null, x: w.x - 6, y: w.y - 16, rot: 0, scale: 1, text: "" };
}
/** A text box is rewritten where it is; it is hidden while the field is over it */
function rewrite(note: TextBox) {
  menu.value = null;
  writing.value = { ...note, text: note.title };
}
function doneWriting(text: string | null) {
  const w = writing.value;
  writing.value = null;
  if (w === null || text === null) return;
  if (w.id === null) {
    const n = store.addText(text, { x: w.x, y: w.y });
    if (n !== undefined) select(notes.value?.find((m) => m.id === n.id) ?? null);
    return;
  }
  const note = notes.value?.find((n) => n.id === w.id);
  if (note === undefined) return;
  // emptied: it goes like any card, with the toast's undo
  if (text.trim() === "") remove(note);
  else store.editText(w.id, text);
}

// ---- adding from the form: place at viewport center, pop ----
/** The card that just landed, and where the ring around it goes */
const pop = ref<{ id: NoteId; x: number; y: number } | null>(null);
/** The shell's toast takes back a note just added */
const undoAdd = (id: NoteId) => ({ undo: () => store.remove(id) });

// ---- deleting: the card leaves at once; the room hears about it once the toast is gone ----
const pendingDelete = ref(new Set<NoteId>());
const shownNotes = computed(() => {
  // the card under a finger, read once for all of them
  const h = held.value;
  return (
    (notes.value ?? [])
      // a text box being rewritten is shown by its field instead
      .filter((n) => !pendingDelete.value.has(n.id) && n.id !== writing.value?.id)
      .map((n) =>
        h?.id !== n.id ? n : { ...n, x: h.x, y: h.y, ...(h.kind === "shape" ? h.shape : {}) },
      )
  );
});
function remove(note: Note) {
  const card = cardEl(note);
  const hadFocus =
    card?.contains(document.activeElement) === true ||
    menuEl.value?.contains(document.activeElement) === true;
  menu.value = null;
  pendingDelete.value.add(note.id);
  const title = note.kind === "sticker" ? i18n.t("canvas.sticker") : note.title;
  toast.show(i18n.t("canvas.deleted", { title }), {
    undo: () => {
      pendingDelete.value.delete(note.id);
      // the card comes back where the keyboard left it
      if (hadFocus) void nextTick(() => cardEl(note)?.focus());
    },
    settle: () => {
      if (pendingDelete.value.delete(note.id)) store.remove(note.id);
    },
  });
  // keyboard users land on the undo, not on the page
  if (hadFocus)
    void nextTick(() => document.querySelector<HTMLElement>('[role="status"] button')?.focus());
}
const { mutateAsync: suggestAt, isLoading: thinking } = useWorkerCalls().suggest;
/**
 * The ask for ideas while it is open under its button: the note it starts from (picked from a
 * card's toolbar), or none for the whole trip. The words being written are kept apart, so a
 * failed ask keeps them for the next try.
 */
const asking = shallowRef<{ kind: "closed" } | { kind: "trip" } | { kind: "note"; about: Note }>({
  kind: "closed",
});
const askWords = ref("");
const askInput = useTemplateRef<HTMLInputElement>("askInput");
const askId = useId();
function openAsk(about: Note | null) {
  asking.value = about === null ? { kind: "trip" } : { kind: "note", about };
  void nextTick(() => askInput.value?.focus());
}
function toggleAsk() {
  if (asking.value.kind === "closed") openAsk(null);
  else asking.value = { kind: "closed" };
}
function askFromMenu() {
  const n = menuNote.value;
  closeMenu();
  if (n !== null) openAsk(n);
}
function onAskKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  asking.value = { kind: "closed" };
}
function onAskSubmit(e: Event) {
  e.preventDefault();
  void askForIdeas();
}
/**
 * The room's agent leaves a few ideas where the person is looking, or in a column beside the
 * note they asked from. They arrive as the room's changes, like the partner's cards; the toast
 * says how many, or why none came.
 */
async function askForIdeas() {
  const a = asking.value;
  if (thinking.value || a.kind === "closed") return;
  // the desk is always there while it asks; were it not, its corner
  const r = vp.value?.getBoundingClientRect() ?? { width: 0, height: 0 };
  // the column's middle: a card's width (164px) and a gap past the note's right edge
  const at =
    a.kind === "trip"
      ? toWorld(r.width / 2, r.height / 2)
      : { x: a.about.x + 164 * a.about.scale + 24 + 94, y: a.about.y + 40 };
  asking.value = { kind: "closed" };
  try {
    const answer = await suggestAt({
      at: { x: at.x, y: at.y },
      ask: askWords.value,
      about: a.kind === "note" ? a.about.id : null,
    });
    if (!answer.ok) {
      const limit =
        answer.refused.ceiling === "trip" ? "canvas.ideasTripLimit" : "canvas.ideasLimit";
      toast.show(i18n.t(limit));
      return;
    }
    const n = answer.value;
    askWords.value = "";
    toast.show(n === 0 ? i18n.t("canvas.noIdeas") : i18n.t("canvas.ideasAdded", { count: n }));
  } catch {
    toast.show(i18n.t("canvas.ideasFailed"));
  }
}
function write() {
  void openSheet({ kind: "new", pin: null });
}
function placeAtCenter(input: NoteInput, how: PlaceHow) {
  // the desk is always there while it places; were it not, its corner
  const r = vp.value?.getBoundingClientRect() ?? { width: 0, height: 0 };
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
useCanvasPlace(placeAtCenter);

// ---- stickers: a picture picked from the photos, pasted or dropped, stuck where it is put ----
const stickerInput = useTemplateRef<HTMLInputElement>("stickerInput");
/** A sticker on its way to the room: one at a time */
const sticking = ref(false);
function pickSticker() {
  stickerInput.value?.click();
}
function onStickerPicked(e: Event) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = ""; // the same picture can be picked again after a failure
  if (file !== undefined) void stick(file);
}
/** The first picture among what was pasted or dropped */
const pictureIn = (files: FileList | undefined) =>
  [...(files ?? [])].find((f) => f.type.startsWith("image/"));
/**
 * A picture pasted on a computer becomes a sticker in the middle of the desk, and a link a card
 * there; pasted into words being written (a form, a text box), they are theirs
 */
function onPaste(e: ClipboardEvent) {
  const target = e.target;
  if (target instanceof Element && target.closest("input, textarea, [contenteditable]") !== null)
    return;
  const file = pictureIn(e.clipboardData?.files);
  if (file !== undefined) {
    e.preventDefault();
    void stick(file);
    return;
  }
  const url = httpUrl(e.clipboardData?.getData("text/plain").trim());
  if (url === null) return;
  e.preventDefault();
  void linkCard(url);
}
/**
 * A link on the desk: a Google Maps one is a note at that place; any other is a card named
 * after its site at once, which the page's title, line and picture then fill in, when the page
 * says and the Worker can be asked, as long as nobody has written on the card meanwhile
 */
async function linkCard(url: HttpUrl) {
  const place = placeFromUrl(url, null);
  if (place.pin !== null || isShortMapsLink(url)) {
    placeAtCenter(
      { ...blankInput(tags.selected, place.pin), title: i18n.t("canvas.pastedPlace"), ...place },
      "pop",
    );
    return;
  }
  const site = siteOf(url);
  // a print, on white stock
  const n = placeAtCenter(
    { ...blankInput(tags.selected, null), title: site, link: url, color: "#ffffff" },
    "pop",
  );
  const api = worker.api;
  if (api === null || cut.offline) return;
  try {
    const answer = await api.preview(url);
    if (!answer.ok || answer.value === null) return;
    const found = answer.value;
    const now = store.notes.value?.find((x) => x.id === n.id);
    // written on, or gone, meanwhile: the page's words are not wanted
    if (now?.kind !== "memo" || now.title !== site || now.body !== "") return;
    store.update(n.id, {
      link: found.url,
      title: found.title ?? site,
      body: found.description ?? "",
      ...(now.image === null && found.image !== null ? { image: found.image } : {}),
    });
  } catch {
    // the card is on the desk with its link; the page's words were a nicety
  }
}
/** Only a dragged file is taken; a picture dropped on the desk is stuck where it lands */
function onDragOver(e: DragEvent) {
  if (!(e.dataTransfer?.types.includes("Files") ?? false)) return;
  e.preventDefault();
  if (e.dataTransfer !== null) e.dataTransfer.dropEffect = "copy";
}
function onDrop(e: DragEvent) {
  const file = pictureIn(e.dataTransfer?.files);
  if (file === undefined) return;
  e.preventDefault();
  void stick(file, { x: e.clientX, y: e.clientY });
}
/**
 * Keep the picture in the room, then stick it with its middle at `at` (a point on the screen;
 * the desk's middle by default). It lands with the pop, and the toast can take it back.
 */
async function stick(file: Blob, at?: Pt) {
  const api = worker.api;
  if (api === null || sticking.value) return;
  sticking.value = true;
  try {
    const kept = await api.uploadImage(await shrinkImage(file, STICKER_SIDE));
    if (!kept.ok) {
      toast.show(i18n.t("form.photoFull"));
      return;
    }
    const image = kept.value;
    // the desk is always there while it sticks; were it not, its corner
    const r = vp.value?.getBoundingClientRect() ?? { width: 0, height: 0 };
    const c = toWorld(at?.x ?? r.width / 2, at?.y ?? r.height / 2);
    const n = store.addSticker(image, { x: c.x - 80, y: c.y - 80 });
    pop.value = { id: n.id, x: n.x - 14, y: n.y - 14 };
    window.setTimeout(() => (pop.value = null), 900);
    toast.show(i18n.t("canvas.stickerAdded"), undoAdd(n.id));
  } catch {
    toast.show(i18n.t("canvas.stickerFailed"));
  } finally {
    sticking.value = false;
  }
}
onMounted(() => document.addEventListener("paste", onPaste));
onBeforeUnmount(() => document.removeEventListener("paste", onPaste));

// The wheel is listened to on the desk itself, not with @wheel: Vapor delegates a template's
// handlers to the document, where Chrome makes a wheel listener passive, so preventDefault is
// ignored and a trackpad pinch zooms the whole page instead of the desk
onMounted(() => vp.value?.addEventListener("wheel", onWheel, { passive: false }));
onBeforeUnmount(() => vp.value?.removeEventListener("wheel", onWheel));

// The first look (firstLook), the one a note is placed in before the canvas is opened
onMounted(() =>
  nextTick(() => {
    const r = vp.value?.getBoundingClientRect();
    if (r === undefined) return;
    view.value = firstLook(notes.value ?? [], r.width, r.height);
  }),
);
// Notes that arrive later (the room's first snapshot) get the same first look, once
watch(
  () => (notes.value?.length ?? 0) > 0,
  (has, had) => {
    if (!has || had) return;
    void nextTick(() => {
      view.value = fitted(FIRST_LOOK_MIN_SCALE) ?? view.value;
    });
  },
);
</script>

<template>
  <section>
    <!-- no bar: the desk runs to the top, and what would sit in a bar floats on it -->
    <div>
      <p v-if="notes?.length === 0">{{ i18n.t("canvas.empty") }}</p>

      <div class="top">
        <FilterBar />
        <CtButton
          v-if="worker.api !== null"
          variant="ask"
          :disabled="thinking || cut.offline"
          :busy="thinking"
          :aria-expanded="asking.kind !== 'closed'"
          :aria-controls="askId"
          @click="toggleAsk"
        >{{ i18n.t(thinking ? "canvas.thinking" : "canvas.askIdeas") }}</CtButton>
      </div>

      <!--
        what to ask the agent for: a line of words, blank for anything, from a note or not; it
        unfolds down from its button and folds back up into it
      -->
      <Transition name="ask">
        <form
          v-if="asking.kind !== 'closed'"
          :id="askId"
          class="ask"
          :aria-label="i18n.t('canvas.askIdeas')"
          @submit="onAskSubmit"
        >
          <p v-if="asking.kind === 'note'">{{
            i18n.t("canvas.askFrom", { title: asking.about.title })
          }}</p>
          <input
            ref="askInput"
            v-model="askWords"
            enterkeyhint="send"
            maxlength="100"
            :aria-label="i18n.t('canvas.askWords')"
            :placeholder="i18n.t('canvas.askWords')"
            @keydown="onAskKey"
          />
          <div>
            <CtButton @click="toggleAsk">{{ i18n.t("common.close") }}</CtButton>
            <CtButton type="submit" variant="primary">{{ i18n.t("canvas.ask") }}</CtButton>
          </div>
        </form>
      </Transition>

      <!--
        the desk's window: it pans under a finger and hears what its cards' keys and drops do,
        but is no control of its own; the cards are what assistive technology meets, and the
        page round them stays readable as a page
      -->
      <div
        ref="vp"
        class="desk"
        role="presentation"
        :data-panning="panning || undefined"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @keydown="onKey"
        @dragover="onDragOver"
        @drop="onDrop"
      >
        <div :style="worldStyle">
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
          <TextField
            v-if="writing !== null"
            :key="writing.id ?? 'new'"
            :rot="writing.rot"
            :scale="writing.scale"
            :text="writing.text"
            :x="writing.x"
            :y="writing.y"
            @done="doneWriting"
          />
          <div v-if="pop !== null" class="ring" :style="`--x: ${pop.x}px; --y: ${pop.y}px`"></div>
        </div>
      </div>

      <div class="jump">
        <button type="button" @click="fitAll">{{ i18n.t("common.fitAll") }}</button>
      </div>

      <!--
        a sticker from the photos, a tile over the write button's; on a computer one is also
        pasted or dropped on the desk
      -->
      <button
        v-if="worker.api !== null"
        class="sticker"
        type="button"
        :aria-label="i18n.t(sticking ? 'canvas.stickerSending' : 'canvas.sticker')"
        :disabled="sticking"
        :aria-busy="sticking"
        @click="pickSticker"
      ><Icon :size="24" :src="stickerIcon" /></button>
      <!--
        PNG first and no HEIC: iOS then hands a photo over as PNG, which keeps a lifted
        subject's see-through parts; handed over as HEIC it reached the page opaque
      -->
      <input
        ref="stickerInput"
        accept="image/png,image/webp"
        hidden
        type="file"
        @change="onStickerPicked"
      />

      <div
        v-if="menu !== null"
        ref="menuEl"
        role="toolbar"
        :aria-label="menu.note.kind === 'sticker' ? i18n.t('canvas.sticker') : menu.note.title"
        :style="`inset-inline-start:${menu.x}px; inset-block-start:${menu.y}px`"
        @pointerdown.stop
        @keydown="onMenuKey"
      >
        <button v-if="menu.note.kind === 'text'" type="button" @click="rewriteFromMenu">{{
          i18n.t("common.edit")
        }}</button>
        <!-- the trip's days: a memo goes on one from the desk, where the ideas are -->
        <div
          v-if="menuMemo !== null && (trip?.days.length ?? 0) > 0"
          role="group"
          :aria-label="i18n.t('canvas.day')"
        >
          <button
            v-for="d in trip?.days"
            :key="d.date.toString()"
            type="button"
            :aria-pressed="onMenuDay(d.date)"
            @click="() => setMenuDay(d.date)"
          >{{ shortDate(d.date, i18n.locale) }}</button>
          <button
            type="button"
            :aria-pressed="menuMemo.schedule === null"
            @click="() => setMenuDay(null)"
          >{{ i18n.t("canvas.noDay") }}</button>
        </div>
        <!-- the agent's ideas built on this note; a sticker has no words to build on -->
        <button
          v-if="worker.api !== null && menu.note.kind !== 'sticker'"
          type="button"
          :disabled="thinking || cut.offline"
          @click="askFromMenu"
        >{{ i18n.t("canvas.ideasFromHere") }}</button>
        <button type="button" @click="duplicateFromMenu">{{ i18n.t("canvas.duplicate") }}</button>
        <button type="button" @click="removeFromMenu">{{ i18n.t("canvas.delete") }}</button>
      </div>

      <CtFab :label="i18n.t('canvas.write')" @click="write"><Icon :size="24" :src="plusIcon" /></CtFab>
    </div>
  </section>
</template>

<style scoped>
@import "../../../../ui/styles/media.css";

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
      padding: var(--top-inset) 12px 0 0;
      pointer-events: none;

      > * {
        pointer-events: auto;
      }

      /* the ask floats over the desk, lifted off it as the tools are */
      > button {
        flex-shrink: 0;
        box-shadow: var(--shadow-tool);
      }
    }

    /* The ask for ideas, open under its button: a panel with a line of words and the ask */
    > .ask {
      position: absolute;
      inset-inline-end: 12px;
      inset-block-start: var(--top-clear);
      z-index: var(--z-menu);
      width: min(360px, calc(100% - 24px));
      display: grid;
      gap: 10px;
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 14px;
      box-shadow: var(--shadow-float);
      /* it grows out of its button, at the row's end above it */
      transform-origin: 100% 0;

      /* opening: the panel unfolds, then what is in it settles a beat later */
      &.ask-enter-active {
        transition:
          opacity var(--duration-swap) ease,
          transform var(--duration-morph) var(--ease-morph);

        > * {
          transition:
            opacity var(--duration-swap) ease 60ms,
            transform var(--duration-morph) var(--ease-morph) 60ms;

          @media (--reduced-motion) {
            transition: none;
          }
        }
      }
      &.ask-enter-from {
        opacity: 0;
        transform: translateY(-10px) scale(0.92);

        > * {
          opacity: 0;
          transform: translateY(-4px);
        }
      }

      /* closing: quicker, folding back up into the button */
      &.ask-leave-active {
        transition:
          opacity calc(var(--duration-swap) * 0.6) ease-in,
          transform calc(var(--duration-swap) * 0.6) ease-in;
      }
      &.ask-leave-to {
        opacity: 0;
        transform: translateY(-6px) scale(0.96);
      }

      /* the note it starts from, on one line */
      > p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-size: var(--font-sm);
        font-weight: 700;
      }

      > input {
        width: 100%;
        font: inherit;
        font-size: var(--font-base);
        padding: 10px 12px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--surface);
        color: var(--ink);
      }

      > div {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
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

    > .desk {
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
      display: flex;
      gap: 8px;

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

    /*
     * The sticker: the write button's ink tile, stacked over it, the two ways to put something
     * new on the desk in the thumb's reach
     */
    > .sticker {
      position: absolute;
      inset-inline-end: 16px;
      inset-block-end: calc(var(--dock-clear) + 16px + 56px + 12px);
      z-index: var(--z-chrome);
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--ink);
      color: var(--on-ink);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-float);
      transition: box-shadow var(--duration-swap) ease, opacity var(--duration-swap) ease;

      /* sending: the tile fades while it waits */
      &:disabled {
        opacity: 0.5;
      }

      @media (--can-hover) {
        &:hover {
          box-shadow: var(--shadow-lift);
        }
      }
    }

    /* The card's menu: the trip's days, then the actions; wraps on a narrow desk */
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

      }

      /* the days, a row of their own above the actions; the memo's day inked */
      > [role="group"] {
        flex-basis: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding-block-end: 4px;
        border-block-end: 1px solid var(--line);

        > button {
          min-height: var(--tap);
          padding: 0 10px;
          border-radius: 999px;
          font-size: var(--font-sm);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--muted);

          @media (--can-hover) {
            &:hover {
              background: var(--wash);
            }
          }

          &[aria-pressed="true"] {
            background: var(--ink);
            color: var(--surface);
          }
        }
      }
    }
  }
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
</style>
