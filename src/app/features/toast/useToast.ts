import { shallowRef } from "vue";

import { defineStore } from "pinia";

/** What the toast offers: an undo, and what happens when it leaves without one */
export interface ToastAction {
  /** Called by 取り消す */
  undo?: () => void;
  /**
   * Called when the toast goes any other way (timeout, a newer toast, the room it was shown in
   * left: useRoom); a pending delete becomes real here
   */
  settle?: () => void;
}

interface Toast extends ToastAction {
  text: string;
}

const SHOWN_MS = 3200;

/**
 * The shell's one toast. Every view reports through it, so a note written from the map
 * confirms on the map instead of on a canvas nobody can see.
 */
export const useToast = defineStore("toast", () => {
  const current = shallowRef<Toast | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, action: ToastAction = {}) {
    settle();
    current.value = { text, ...action };
    timer = setTimeout(settle, SHOWN_MS);
  }
  /** The toast leaves; whatever it was holding open goes through */
  function settle() {
    clearTimeout(timer);
    const t = current.value;
    current.value = null;
    t?.settle?.();
  }
  function undo() {
    clearTimeout(timer);
    const t = current.value;
    current.value = null;
    t?.undo?.();
  }

  return { current, show, settle, undo };
});
