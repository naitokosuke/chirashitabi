import { shallowRef } from "vue";

import { defineStore } from "pinia";

import type { RoomId } from "../rooms/types";
import type { Mutation } from "../sync/types";
import { useSync } from "../sync/useSync";

/** What the toast offers: an undo, and what happens when it leaves without one */
interface ToastAction {
  /** Called by 取り消す */
  undo?: () => void;
  /**
   * Called when the toast goes any other way (timeout, a newer toast, the room it was shown in
   * left: useRoom); a pending delete becomes real here
   */
  settle?: () => void;
  /**
   * The change `settle` commits, kept with the room while the page is hidden (useRoom): a page
   * the browser throws away in the background still makes it on its next visit
   */
  commits?: Mutation;
}

/** How a toast is shown */
interface ToastOptions extends ToastAction {
  /**
   * The room it is about, for an answer that may come after that room was left: it is said
   * only while that room is open, so it never takes the place of another room's toast (nor
   * settles what that one holds open)
   */
  room?: RoomId;
  /** The keyboard moves onto its undo, for one who was on what it takes back */
  focus?: boolean;
  /**
   * Where the keyboard goes when the toast leaves while holding it, its undo not pressed (a
   * newer toast, the room left): the view it was shown over, rather than the page
   */
  refocus?: () => void;
}

interface Toast extends ToastAction {
  text: string;
  room: RoomId | null;
  focus: boolean;
  refocus?: () => void;
}

const SHOWN_MS = 3200;

/**
 * The shell's one toast. Every view reports through it, so a note written from the map
 * confirms on the map instead of on a canvas nobody can see. It goes after a while, but not
 * while the keyboard is on it or the pointer over it (`hold`): its undo waits for whoever is
 * reading it, and its time starts again once they let it go.
 */
export const useToast = defineStore("toast", () => {
  const sync = useSync();
  const current = shallowRef<Toast | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** What keeps the toast up past its time: the keyboard on it, the pointer over it */
  const holds = new Set<"focus" | "pointer">();

  /** Its time starts again, unless something holds it */
  function rewind() {
    clearTimeout(timer);
    if (current.value !== null && holds.size === 0) timer = setTimeout(settle, SHOWN_MS);
  }
  function show(text: string, { room, focus = false, ...action }: ToastOptions = {}) {
    if (room !== undefined && room !== sync.room) return;
    settle();
    current.value = { text, room: room ?? sync.room, focus, ...action };
    rewind();
  }
  /** The keyboard or the pointer comes onto the toast (`on`), or leaves it */
  function hold(by: "focus" | "pointer", on: boolean) {
    if (on) holds.add(by);
    else holds.delete(by);
    rewind();
  }
  /** The toast leaves; whatever it was holding open goes through, and the keyboard on it goes back */
  function settle() {
    clearTimeout(timer);
    const t = current.value;
    // the keyboard leaves with it (the pointer may stay over the next one)
    const focused = holds.delete("focus");
    current.value = null;
    if (focused) t?.refocus?.();
    t?.settle?.();
  }
  function undo() {
    clearTimeout(timer);
    const t = current.value;
    holds.delete("focus");
    current.value = null;
    t?.undo?.();
  }

  return { current, show, hold, settle, undo };
});
