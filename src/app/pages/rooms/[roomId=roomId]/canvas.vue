<script lang="ts">
import type { NoteId } from "../../../features/notes/id";
import type { Note } from "../../../features/notes/types";

/**
 * What is open on the desk, one at a time: a card's menu, or words being written (a new text
 * box, no id, or one being rewritten, and where they sit). The ask for ideas is apart: it stays
 * open beside either.
 */
type Overlay =
  | { kind: "none" }
  | { kind: "menu"; id: NoteId; x: number; y: number }
  | {
      kind: "writing";
      id: NoteId | null;
      x: number;
      y: number;
      rot: number;
      scale: number;
      text: string;
    };
const NONE: Overlay = { kind: "none" };
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
  useTemplateRef,
  watch,
} from "vue";

import { useRoute, useRouter } from "vue-router";

import { CtChip, CtFab, CtHint, CtMenu, CtMenuGroup, CtMenuItem } from "../../../../ui/index";

import { useI18n } from "../../../i18n/useI18n";

import AskIdeas from "../../../features/canvas/AskIdeas.vue";
import {
  angleOf,
  heldOf,
  IDLE,
  resized,
  turned,
  type Gesture,
  type Pivot,
} from "../../../features/canvas/gesture";
import NoteCard from "../../../features/canvas/NoteCard.vue";
import TextField from "../../../features/canvas/TextField.vue";
import {
  distance,
  fitView,
  pinchTo,
  startPinch,
  type Pt,
} from "../../../features/canvas/transform";
import { useIntake, type Intake } from "../../../features/canvas/useIntake";
import {
  FIRST_LOOK_MIN_SCALE,
  firstLook,
  useCanvasPlace,
  type PlaceHow,
} from "../../../features/canvas/usePlace";
import { useViewport } from "../../../features/canvas/useViewport";
import { noteLabel } from "../../../features/notes/label";
import { type FormTarget, type NoteInput, type TextBox } from "../../../features/notes/types";
import { useNotes } from "../../../features/notes/useNotes";
import { useInRoom } from "../../../features/sync/InRoom.vue";
import { useOffline } from "../../../features/sync/useOffline";
import FilterBar from "../../../features/tags/FilterBar.vue";
import { useTags } from "../../../features/tags/useTags";
import { useToast } from "../../../features/toast/useToast";
import { shortDate } from "../../../features/trip/format";
import { assignTo } from "../../../features/trip/itinerary";
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
const here = useInRoom();
const tags = useTags();
const i18n = useI18n();
/** Cut off: what needs the Worker is not offered */
const cut = useOffline();
const { view, toWorld, zoomAt, animateTo } = useViewport();
const vp = useTemplateRef<HTMLElement>("vp");
/** The whole view, where the keyboard goes when what it was on went */
const deskView = useTemplateRef<HTMLElement>("deskView");
const worldStyle = computed(
  // --zoom: the handles on a picked card undo it, to stay the same size on screen
  () =>
    `transform: translate(${view.value.tx}px, ${view.value.ty}px) scale(${view.value.s}); --zoom: ${view.value.s}`,
);

// ---- pointer state ----
// Where each finger is: plain, never reactive (changes every frame)
const pointers = new Map<number, Pt>();
// Shallow: the gesture is replaced when it changes kind, and every frame a card under a finger
// moves (it is drawn from there); a pan's fields are mutated in place without triggering anything.
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
// Shallow: replaced whenever what is open changes, or where the menu sits
const overlay = shallowRef<Overlay>(NONE);
/** The menu's card as it is now (its color changes while the menu is open); none once it went */
const menuNote = computed(() => {
  const m = overlay.value;
  return m.kind !== "menu" ? null : (notes.value?.find((n) => n.id === m.id) ?? null);
});
/**
 * The menu goes, focus staying where it is (a press on the desk, a card deleted); words being
 * written are left to end on their own, as their field loses the caret
 */
function dropMenu() {
  if (overlay.value.kind === "menu") overlay.value = NONE;
}
// a card deleted by the partner, or in another room, takes its menu with it, and the keyboard
// in the menu goes to the desk rather than to nowhere
watch(
  () => overlay.value.kind === "menu" && menuNote.value === null,
  (gone) => {
    if (!gone) return;
    const hadFocus = menuEl.value?.holdsFocus() ?? false;
    dropMenu();
    if (hadFocus) deskView.value?.focus({ preventScroll: true });
  },
);

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

/** A card's middle on screen: what it turns and grows around (its transform's origin) */
function pivotOf(note: Note): Pivot | null {
  const r = cardEl(note)?.getBoundingClientRect();
  return r === undefined ? null : { note, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

// The desk's handlers, frames and timers below run in a browser only, never while rendering on a
// server; each says so where it reaches for the page, so that holds should it ever render there
function onDown(e: PointerEvent) {
  if (import.meta.env.SSR) return;
  const target = e.target;
  // a control keeps its own press: a link on a card opens its page, a button does what it says,
  // words being written take the caret. None of them is the desk or a card to drag, pick or open
  // a menu on; a memo's title is no control here (it is a paragraph that is the card's button)
  if (
    !(target instanceof Element) ||
    target.closest("a, button, input, select, textarea, [contenteditable]") !== null
  )
    return;
  dropMenu();
  vp.value?.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // a second finger turns whatever was going on into a pinch (a card under the first one is let
  // go where it is, so the partner, who saw it on its way, ends up where it does); a third is ignored
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    if (pointers.size === 2 && a !== undefined && b !== undefined) {
      land();
      setGesture({ kind: "pinch", start: startPinch(view.value, a, b) });
    }
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
            shape: null,
            lastSend: 0,
          }
        : { kind: "rotate", at, a0: angleOf(at, p), rot0: note.rot, shape: null, lastSend: 0 },
    );
    return;
  }
  // the keyboard follows the pointer onto the card, wherever on it the press landed
  focusCard(note);
  const w = toWorld(e.clientX, e.clientY);
  setGesture({
    kind: "press",
    grab: { note, ox: w.x - note.x, oy: w.y - note.y },
    sx: e.clientX,
    sy: e.clientY,
    // only fires while still pressing: moving or lifting clears it
    timer: setTimeout(pressedLong, 420, note),
  });
}
/** Held without moving: the card is picked and its menu opens */
function pressedLong(note: Note) {
  if (import.meta.env.SSR) return;
  setGesture(IDLE);
  select(note);
  navigator.vibrate?.(10);
  openMenu(note);
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  const p = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, p);
  let g = gesture.value;
  if (g.kind === "press" && distance(p, { x: g.sx, y: g.sy }) > 6) {
    // a card that is dragged is the one picked
    select(g.grab.note);
    g = { kind: "drag", grab: g.grab, to: null, lastSend: 0 };
  }
  switch (g.kind) {
    case "pinch": {
      const [a, b] = [...pointers.values()];
      if (a !== undefined && b !== undefined) view.value = pinchTo(g.start, a, b);
      return;
    }
    case "drag": {
      const w = toWorld(p.x, p.y);
      return hold({ ...g, to: { x: w.x - g.grab.ox, y: w.y - g.grab.oy } });
    }
    case "resize":
      return hold({ ...g, shape: resized(g, p) });
    case "rotate":
      return hold({ ...g, shape: turned(g, p, e.shiftKey) });
    case "pan":
      if (!g.moved && distance(p, { x: g.x, y: g.y }) <= 6) return;
      g.moved = true;
      view.value.tx = g.tx + (p.x - g.x);
      view.value.ty = g.ty + (p.y - g.y);
  }
}
/**
 * The card under a finger follows it here every frame; the partner sees it change at ~12/s,
 * whenever it is due again
 */
function hold(g: Extract<Gesture, { kind: "drag" | "resize" | "rotate" }>) {
  const now = performance.now();
  const due = now - g.lastSend > 80;
  setGesture(due ? { ...g, lastSend: now } : g);
  const h = heldOf(g);
  if (due && h !== null) store.sendMove(h.id, h.x, h.y, h.kind === "shape" ? h.shape : undefined);
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
  land();
  setGesture(IDLE);
}
/** Let go of the card under a finger: the one write of where it landed, how it is turned and how large */
function land() {
  const h = heldOf(gesture.value);
  if (h !== null) store.move(h.id, h.x, h.y, h.kind === "shape" ? h.shape : undefined);
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
    if (overlay.value.kind === "menu") closeMenu();
    else select(null);
    return;
  }
  // a link on a memo opens its page with Enter, not the memo
  if (e.target instanceof Element && e.target.closest("a") !== null) return;
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
  if (import.meta.env.SSR) return;
  const r = vp.value?.getBoundingClientRect();
  if (r === undefined) return;
  const card = cardEl(note)?.getBoundingClientRect();
  if (card === undefined) return;
  overlay.value = {
    kind: "menu",
    id: note.id,
    x: Math.max(8, card.left - r.left),
    y: Math.max(card.bottom - r.top + CLEAR, 8),
  };
  // once it is drawn: measure it, keep it on screen (above the card near the bottom), and move focus in
  void nextTick(() => {
    if (import.meta.env.SSR) return;
    const m = menuEl.value;
    if (m === null || overlay.value.kind !== "menu") return;
    const { width: w, height: h } = m.size();
    const x = Math.max(8, Math.min(card.left - r.left, r.width - w - 8));
    const below = card.bottom - r.top + CLEAR;
    // the desk runs under the dock: the floor is the dock's top, less the write button's row
    const dock = document.querySelector("[data-dock]")?.getBoundingClientRect().top ?? r.bottom;
    const floor = Math.min(r.bottom, dock) - r.top - 72;
    const y = below + h > floor ? card.top - r.top - h - CLEAR : below;
    overlay.value = { kind: "menu", id: overlay.value.id, x, y: Math.max(y, 8) };
    // the keyboard moves into it; a tap that picked the card leaves focus where it was
    if (focus) m.focusFirst();
  });
}
const menuEl = useTemplateRef<{
  size(): { width: number; height: number };
  focusFirst(): void;
  holdsFocus(): boolean;
}>("menuEl");
const cardEl = (note: Note) => vp.value?.querySelector<HTMLElement>(`[data-id="${note.id}"]`);
/** Where the keyboard goes on a card: the card, or a memo's title (a memo holds links, so it is no button itself) */
const focusCard = (note: Note) =>
  vp.value
    ?.querySelector<HTMLElement>(
      `[data-id="${note.id}"][tabindex], [data-id="${note.id}"] .title[tabindex]`,
    )
    ?.focus();
/** Close the menu; focus returns to its card when the keyboard was in the menu */
function closeMenu() {
  const n = menuNote.value;
  if (overlay.value.kind !== "menu") return;
  const hadFocus = menuEl.value?.holdsFocus() ?? false;
  overlay.value = NONE;
  if (hadFocus && n !== null) focusCard(n);
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
  const o = overlay.value;
  if (o.kind === "menu") store.duplicate(o.id);
  closeMenu();
}
function rewriteFromMenu() {
  const n = menuNote.value;
  if (n?.kind === "text") rewrite(n);
}
function removeFromMenu() {
  const n = menuNote.value;
  if (n !== null) remove(n);
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
  overlay.value = {
    kind: "writing",
    id: null,
    x: w.x - 6,
    y: w.y - 16,
    rot: 0,
    scale: 1,
    text: "",
  };
}
/** A text box is rewritten where it is; it is hidden while the field is over it */
function rewrite(note: TextBox) {
  const { id, x, y, rot, scale } = note;
  overlay.value = { kind: "writing", id, x, y, rot, scale, text: note.text };
}
function doneWriting(text: string | null) {
  const w = overlay.value;
  if (w.kind !== "writing") return;
  overlay.value = NONE;
  if (text === null) return;
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
/** How long a card's pop lasts */
const POP_MS = 900;
/** The pop of card `id` is over; one that landed since has its own */
function popped(id: NoteId) {
  if (pop.value?.id === id) pop.value = null;
}
/** The shell's toast takes back a note just added */
const undoAdd = (id: NoteId) => ({ undo: () => store.remove(id) });

// ---- deleting: gone from every tab at once; the room hears about it once the toast is gone ----
const shownNotes = computed(() => {
  // the card under a finger, and the text box being rewritten, read once for all of them
  const h = heldOf(gesture.value);
  const o = overlay.value;
  const rewritten = o.kind === "writing" ? o.id : null;
  return (
    (notes.value ?? [])
      // a text box being rewritten is shown by its field instead
      .filter((n) => n.id !== rewritten)
      .map((n) =>
        h?.id !== n.id ? n : { ...n, x: h.x, y: h.y, ...(h.kind === "shape" ? h.shape : {}) },
      )
  );
});
function remove(note: Note) {
  if (import.meta.env.SSR) return;
  const card = cardEl(note);
  const hadFocus =
    card?.contains(document.activeElement) === true || menuEl.value?.holdsFocus() === true;
  dropMenu();
  const deleting = store.removeLater(here.room, note.id);
  toast.show(i18n.t("canvas.deleted", { title: noteLabel(note, i18n.t) }), {
    undo: () => {
      deleting.undo();
      // the card comes back where the keyboard left it
      if (hadFocus) void nextTick(() => focusCard(note));
    },
    settle: deleting.settle,
    commits: deleting.commits,
    // keyboard users land on the undo, not on the page; gone without it, they are back on the desk
    focus: hadFocus,
    refocus: () => deskView.value?.focus({ preventScroll: true }),
  });
}
function write() {
  void openSheet({ kind: "new", pin: null });
}
/** The window's size; on a server, where there is none, nothing */
function windowSize() {
  if (import.meta.env.SSR) return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}
function placeAtCenter(input: NoteInput, how: PlaceHow) {
  // the desk as it is shown; kept behind another tab it measures nothing, and it comes back
  // filling the window, so the note goes to the middle of the view it comes back to
  const r = vp.value?.isConnected === true ? vp.value.getBoundingClientRect() : windowSize();
  const c = toWorld(r.width / 2, r.height / 2);
  // a sticky's middle there: half its width (--size-paper) and about half its height
  const n = store.add(input, { x: c.x - 82, y: c.y - 40 });
  if (how === "pop") {
    pop.value = { id: n.id, x: n.x - 14, y: n.y - 14 };
    setTimeout(popped, POP_MS, n.id);
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

/**
 * A point on the screen, on the desk; none is the desk's middle (kept behind another tab, the
 * middle of the window it comes back filling, as placeAtCenter has it)
 */
function onDesk(at: Pt | null) {
  const r = vp.value?.isConnected === true ? vp.value.getBoundingClientRect() : windowSize();
  return toWorld(at?.x ?? r.width / 2, at?.y ?? r.height / 2);
}
/**
 * Where the agent's ideas go on the desk: for the whole trip, where the person is looking; from
 * a note, a column beside it, a gap past its end edge as it is drawn (a print, a long text box
 * and a sticker are wider than a sticky). The Worker centers each idea's card on the column's
 * middle, askew by 12px either way, so the middle sits half a card (82px) and that 12px further
 * on. A card's width is its own before its scale, which grows it about its middle.
 */
function ideasAt(about: Note | null): Pt {
  if (about === null) return onDesk(null);
  const width = cardEl(about)?.offsetWidth ?? 0;
  return { x: about.x + (width * (1 + about.scale)) / 2 + 24 + 82 + 12, y: about.y + 40 };
}

// ---- asking for ideas: from its button, or from a card's menu ----
const askEl = useTemplateRef<{ open(about: Note | null): void; busy(): boolean }>("askEl");
function askFromMenu() {
  const n = menuNote.value;
  closeMenu();
  if (n !== null) askEl.value?.open(n);
}

// ---- brought to the desk: a link pasted, a picture picked from the photos, pasted or dropped ----
/**
 * A link's card lands in the middle of the desk, a sticker where it is put; each lands with the
 * pop, and the toast can take it back
 */
function intake(what: Intake): NoteId {
  if (what.kind === "memo") return placeAtCenter(what.input, "pop").id;
  const c = onDesk(what.at);
  const n = store.addSticker(what.image, { x: c.x - 80, y: c.y - 80 });
  pop.value = { id: n.id, x: n.x - 14, y: n.y - 14 };
  setTimeout(popped, POP_MS, n.id);
  toast.show(i18n.t("canvas.stickerAdded"), undoAdd(n.id));
  return n.id;
}
const { sticking, onStickerPicked, onDragOver, onDrop } = useIntake(here, intake);
const stickerInput = useTemplateRef<HTMLInputElement>("stickerInput");
function pickSticker() {
  stickerInput.value?.click();
}

// The wheel is listened to on the desk itself, not with @wheel: Vapor delegates a template's
// handlers to the document, where Chrome makes a wheel listener passive, so preventDefault is
// ignored and a trackpad pinch zooms the whole page instead of the desk
onMounted(() => vp.value?.addEventListener("wheel", onWheel, { passive: false }));
onBeforeUnmount(() => vp.value?.removeEventListener("wheel", onWheel));

// A press on a card puts the keyboard on it (onDown, focusCard); a memo itself takes no focus
// (its title does), so the mouse's own default after the press would hand it back to the page
function keepFocus(e: MouseEvent) {
  if (noteAt(e.target) !== undefined) e.preventDefault();
}
onMounted(() => vp.value?.addEventListener("mousedown", keepFocus));
onBeforeUnmount(() => vp.value?.removeEventListener("mousedown", keepFocus));

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
  <section ref="deskView" tabindex="-1" :aria-label="i18n.t('nav.canvas')">
    <!-- no bar: the desk runs to the top, and what would sit in a bar floats on it -->
    <div>
      <CtHint v-if="notes?.length === 0" class="empty" size="md" strong>{{
        i18n.t("canvas.empty")
      }}</CtHint>

      <div class="top">
        <FilterBar />
        <AskIdeas ref="askEl" :at="ideasAt" />
      </div>

      <!--
        the desk's window: it pans under a finger and hears what its cards' keys and drops do,
        but is no control of its own; the cards are what assistive technology meets, and the
        page round them stays readable as a page
      -->
      <div
        ref="vp"
        class="desk"
        role="presentation"
        :class="{ panning }"
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
            v-if="overlay.kind === 'writing'"
            :key="overlay.id ?? 'new'"
            :rot="overlay.rot"
            :scale="overlay.scale"
            :text="overlay.text"
            :x="overlay.x"
            :y="overlay.y"
            @done="doneWriting"
          />
          <div v-if="pop !== null" class="ring" :style="`--x: ${pop.x}px; --y: ${pop.y}px`"></div>
        </div>
      </div>

      <div class="jump">
        <CtChip float @click="fitAll">{{ i18n.t("common.fitAll") }}</CtChip>
      </div>

      <!--
        a sticker from the photos, a tile over the write button's; on a computer one is also
        pasted or dropped on the desk
      -->
      <CtFab
        class="sticker"
        :label="i18n.t(sticking ? 'canvas.stickerSending' : 'canvas.sticker')"
        :disabled="sticking"
        :aria-busy="sticking"
        @click="pickSticker"
      ><Icon :size="24" :src="stickerIcon" /></CtFab>
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

      <CtMenu
        v-if="overlay.kind === 'menu' && menuNote !== null"
        ref="menuEl"
        :label="noteLabel(menuNote, i18n.t)"
        :x="overlay.x"
        :y="overlay.y"
        @close="closeMenu"
      >
        <CtMenuItem v-if="menuNote.kind === 'text'" @click="rewriteFromMenu">{{
          i18n.t("common.edit")
        }}</CtMenuItem>
        <!-- the trip's days: a memo goes on one from the desk, where the ideas are -->
        <CtMenuGroup v-if="menuMemo !== null" :label="i18n.t('canvas.day')">
          <CtChip
            v-for="d in here.trip.days"
            :key="d.date.toString()"
            toggle
            :selected="onMenuDay(d.date)"
            @click="() => setMenuDay(d.date)"
          >{{ shortDate(d.date, i18n.locale) }}</CtChip>
          <CtChip toggle :selected="menuMemo.schedule === null" @click="() => setMenuDay(null)">{{
            i18n.t("canvas.noDay")
          }}</CtChip>
        </CtMenuGroup>
        <!-- the agent's ideas built on this note; a sticker has no words to build on -->
        <CtMenuItem
          v-if="menuNote.kind !== 'sticker'"
          :disabled="(askEl?.busy() ?? false) || cut.offline"
          @click="askFromMenu"
        >{{ i18n.t("canvas.ideasFromHere") }}</CtMenuItem>
        <CtMenuItem @click="duplicateFromMenu">{{ i18n.t("canvas.duplicate") }}</CtMenuItem>
        <CtMenuItem danger @click="removeFromMenu">{{ i18n.t("canvas.delete") }}</CtMenuItem>
      </CtMenu>

      <CtFab :label="i18n.t('canvas.write')" @click="write"><Icon :size="24" :src="plusIcon" /></CtFab>
    </div>
  </section>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

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
      gap: var(--space-3);
      min-height: var(--top-row);
      padding: var(--top-inset) var(--space-6) 0 0;
      pointer-events: none;

      > * {
        pointer-events: auto;
      }
    }

    /* An empty desk says what to do first */
    > .empty {
      position: absolute;
      inset-inline: var(--space-12);
      inset-block-start: 62%;
      text-align: center;
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

      &.panning {
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
          border-radius: var(--radius-7);
          pointer-events: none;
          transform: translate(var(--x), var(--y));
          animation: ring .7s ease-out .1s both;

          @media (--reduced-motion) {
            display: none;
          }
        }
      }
    }

    /* level with the write button's middle: a chip (--tap tall) floating over the desk */
    > .jump {
      position: absolute;
      inset-inline-start: var(--space-8);
      inset-block-end: calc(var(--dock-clear) + var(--space-8) + (var(--size-fab) - var(--tap)) / 2);
      z-index: var(--z-chrome);
      display: flex;
      gap: var(--space-4);
    }

    /*
     * The sticker: the write button's ink tile, stacked over it, the two ways to put something
     * new on the desk in the thumb's reach
     */
    > .sticker {
      inset-block-end: calc(var(--dock-clear) + var(--space-8) + var(--size-fab) + var(--space-6));
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
