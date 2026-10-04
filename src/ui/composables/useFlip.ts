import { nextTick } from "vue";

/**
 * Moves a row's items to their new places instead of jumping (FLIP): where each item is gets
 * noted, the change renders, and each one slides from its old place to its new one; a new item
 * fades in. Items are the children of `row` carrying `data-flip`, matched by its value.
 * Unlike a View Transition, the page stays live meanwhile, so it can run while someone types.
 * Under reduced motion the change simply happens.
 */
export function useFlip() {
  return function flip(row: HTMLElement | null, update: () => void) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (row === null || reduce || typeof Element.prototype.animate !== "function") {
      update();
      return;
    }
    const items = () => [...row.querySelectorAll<HTMLElement>(":scope > [data-flip]")];
    const before = new Map(items().map((el) => [el.dataset.flip, el.getBoundingClientRect()]));
    update();
    void nextTick(() => {
      const timing = { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
      for (const el of items()) {
        const was = before.get(el.dataset.flip);
        if (was === undefined) {
          el.animate({ opacity: [0, 1], scale: [0.9, 1] }, timing);
          continue;
        }
        const now = el.getBoundingClientRect();
        const dx = was.left - now.left;
        const dy = was.top - now.top;
        if (dx === 0 && dy === 0) continue;
        el.animate({ translate: [`${dx}px ${dy}px`, "0 0"] }, timing);
      }
    });
  };
}
