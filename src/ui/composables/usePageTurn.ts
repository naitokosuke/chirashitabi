import { nextTick, type Ref } from "vue";

/** How long the page takes to clear, and how far apart the pieces of the next one land */
const CLEAR_MS = 120;
const STAGGER_MS = 35;
/** Past this many pieces the rest land together, so a long page is not slow to arrive */
const STAGGER_MAX = 8;

/**
 * Turns a page whose content is replaced (a booklet's day): the old page clears first, then
 * the pieces of the new one (every `[data-turn]` inside, or the page itself) are laid down one
 * after another from the top, each rising a little into place. The two pages never overlap,
 * so nothing is seen through anything else. Under reduced motion the content just changes.
 *
 *   const turn = usePageTurn(pageEl);
 *   turn(() => (day.value = next));
 */
export function usePageTurn(page: Readonly<Ref<HTMLElement | null>>) {
  let running: Animation | null = null;

  return async function turn(update: () => void) {
    const el = page.value;
    const duration =
      el === null ? 0 : parseFloat(getComputedStyle(el).getPropertyValue("--duration-swap")) * 1000;
    if (el === null || !(duration > 0)) {
      update();
      return;
    }
    const css = getComputedStyle(el);
    const ease = css.getPropertyValue("--ease-morph").trim();
    const easing = ease === "" ? "ease-out" : ease;

    // a second turn while the first is clearing: skip straight to the new content
    running?.cancel();
    const clear = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLEAR_MS,
      easing: "ease-in",
      fill: "forwards",
    });
    running = clear;
    try {
      await clear.finished;
    } catch {
      // cancelled by a newer turn, which takes over from here
      return;
    }

    update();
    await nextTick();
    el.scrollTop = 0;

    const pieces = [...el.querySelectorAll<HTMLElement>("[data-turn]")];
    // the pieces start hidden (fill: backwards) in the same frame the page comes back
    (pieces.length > 0 ? pieces : [el]).forEach((piece, i) => {
      piece.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration, easing, delay: Math.min(i, STAGGER_MAX) * STAGGER_MS, fill: "backwards" },
      );
    });
    clear.cancel();
    running = null;
  };
}
