import { onBeforeUnmount, onMounted } from "vue";

import { useI18n } from "../../i18n/useI18n";

import type { NewMemo, Note, NoteInput } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useToast } from "../toast/useToast";

import { fitView, type View } from "./transform";

/** `pop`: the canvas is in view; `quiet`: the form stays open; `away`: written elsewhere */
export type PlaceHow = "pop" | "quiet" | "away";
type Place = (input: NoteInput, how: PlaceHow) => NewMemo;

// Module scope is shared with every importer. The canvas is kept once it is first opened
// (the room keeps its tabs), so one slot is enough; until then it is empty.
let placeOnMounted: Place | undefined;

/** The first look never shrinks a card past readable; the fit button still shows everything */
export const FIRST_LOOK_MIN_SCALE = 0.6;
/**
 * How the canvas first shows `notes` on a desk `width` by `height`: every card, whatever the
 * screen; an empty desk with room to write in the middle
 */
export const firstLook = (notes: Note[], width: number, height: number): View =>
  fitView(notes, width, height, FIRST_LOOK_MIN_SCALE) ?? {
    tx: (width - 164) / 2,
    ty: height / 2 - 60,
    s: 1,
  };

/**
 * Put a note at the centre of the canvas; the toast confirms it wherever the user is.
 * Call in a component's setup. A canvas not opened yet has no view of its own: the note goes
 * to the middle of the first look it will open on, and the toast says it is there.
 */
export function usePlace() {
  const { notes, add, remove } = useNotes();
  const toast = useToast();
  const i18n = useI18n();
  return (input: NoteInput, how: PlaceHow = "pop"): NewMemo => {
    if (placeOnMounted !== undefined) return placeOnMounted(input, how);
    const [w, h] = [window.innerWidth, window.innerHeight];
    const v = firstLook(notes.value ?? [], w, h);
    const n = add(input, { x: (w / 2 - v.tx) / v.s - 82, y: (h / 2 - v.ty) / v.s - 40 });
    const message = how === "quiet" ? "canvas.added" : "canvas.addedAway";
    toast.show(i18n.t(message, { title: n.title }), { undo: () => remove(n.id) });
    return n;
  };
}

/** The canvas, while it is mounted, places notes itself, in its own view; call in its setup */
export function useCanvasPlace(place: Place) {
  onMounted(() => (placeOnMounted = place));
  onBeforeUnmount(() => (placeOnMounted = undefined));
}
