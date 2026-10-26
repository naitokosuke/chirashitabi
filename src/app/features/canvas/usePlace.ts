import { inject, onBeforeUnmount, onMounted, provide, type InjectionKey } from "vue";

import { useI18n } from "../../i18n/useI18n";

import type { NewMemo, Note, NoteInput } from "../notes/types";
import { useNotes } from "../notes/useNotes";
import { useToast } from "../toast/useToast";

import { fitView, type View } from "./transform";

/** `pop`: the canvas is in view; `quiet`: the form stays open; `away`: written elsewhere */
export type PlaceHow = "pop" | "quiet" | "away";
type Place = (input: NoteInput, how: PlaceHow) => NewMemo;

/**
 * A room's placing: how a note is put on its canvas, and the canvas's own place while it is
 * mounted. The canvas is kept once it is first opened (the room keeps its tabs), so one slot is
 * enough; until then it is empty.
 */
interface Placing {
  readonly place: (input: NoteInput, how?: PlaceHow) => NewMemo;
  canvas: Place | undefined;
}

const PLACING: InjectionKey<Placing> = Symbol("placing");

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
 * Put a note at the centre of the canvas; the toast confirms it wherever the user is. Call in
 * the room's setup: what it shows places through the same (usePlace). A canvas not opened yet
 * has no view of its own: the note goes to the middle of the first look it will open on, and
 * the toast says it is there.
 */
export function providePlace() {
  const { notes, add, remove } = useNotes();
  const toast = useToast();
  const i18n = useI18n();
  const placing: Placing = {
    canvas: undefined,
    place(input, how = "pop") {
      if (placing.canvas !== undefined) return placing.canvas(input, how);
      const [w, h] = [window.innerWidth, window.innerHeight];
      const v = firstLook(notes.value ?? [], w, h);
      const n = add(input, { x: (w / 2 - v.tx) / v.s - 82, y: (h / 2 - v.ty) / v.s - 40 });
      const message = how === "quiet" ? "canvas.added" : "canvas.addedAway";
      toast.show(i18n.t(message, { title: n.title }), { undo: () => remove(n.id) });
      return n;
    },
  };
  provide(PLACING, placing);
  return placing.place;
}

/** The room's placing (providePlace) */
function usePlacing(): Placing {
  const placing = inject(PLACING);
  if (placing === undefined) throw new Error("usePlace outside a room");
  return placing;
}

/** Put a note at the centre of the room's canvas (providePlace); call in a component's setup */
export const usePlace = () => usePlacing().place;

/** The canvas, while it is mounted, places notes itself, in its own view; call in its setup */
export function useCanvasPlace(place: Place) {
  const placing = usePlacing();
  onMounted(() => (placing.canvas = place));
  onBeforeUnmount(() => (placing.canvas = undefined));
}
