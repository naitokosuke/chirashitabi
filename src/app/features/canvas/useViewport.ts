import { ref } from "vue";

import * as t from "./transform";

/**
 * The canvas's view; the math lives in ./transform.
 * Kept outside Pinia on purpose: it changes on every pointer move while panning,
 * and nothing but the canvas needs it.
 */
export function useViewport() {
  const view = ref<t.View>({ tx: 0, ty: 0, s: 1 });
  const toWorld = (sx: number, sy: number) => t.toWorld(view.value, sx, sy);
  function zoomAt(sx: number, sy: number, factor: number) {
    view.value = t.zoomAt(view.value, sx, sy, factor);
  }
  function animateTo(to: t.View, dur = 380) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.value = to;
      return;
    }
    const from = { ...view.value },
      t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      view.value = t.tween(from, to, p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return { view, toWorld, zoomAt, animateTo };
}
