import { nextTick } from "vue";

/**
 * Runs a state change inside a View Transition: the browser snapshots the page, the change
 * renders, and the two morph into each other (what morphs, and how, is in transitions.css).
 * `types` lets the CSS pick an animation (`:active-view-transition-type(forward)`).
 * Without the API, under reduced motion, or with the page hidden (where the browser would
 * abort it), the change simply happens.
 */
export function useViewTransition() {
  return function transition(update: () => void, types: readonly string[] = []) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof document.startViewTransition !== "function" || reduce || document.hidden) {
      update();
      return;
    }
    const t = document.startViewTransition(async () => {
      update();
      await nextTick();
    });
    // older engines take only the callback form; types are added where they exist
    for (const type of types) t.types?.add(type);
    // a transition skipped by a newer one (a quick second tap) rejects; the update has run anyway
    t.ready.catch(() => {});
    t.finished.catch(() => {});
  };
}
