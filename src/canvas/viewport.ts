import { ref } from "vue";

/**
 * Screen <-> world transform. world = (screen - t) / s
 * Kept outside Pinia on purpose: it changes on every pointer move while panning,
 * and nothing but the canvas needs it.
 */
export function useViewport() {
  const view = ref({ tx: 0, ty: 0, s: 1 });
  const clamp = (s: number) => Math.min(3, Math.max(0.3, s));
  const toWorld = (sx: number, sy: number) => ({
    x: (sx - view.value.tx) / view.value.s,
    y: (sy - view.value.ty) / view.value.s,
  });
  function zoomAt(sx: number, sy: number, factor: number) {
    const ns = clamp(view.value.s * factor),
      k = ns / view.value.s;
    view.value.tx = sx - (sx - view.value.tx) * k;
    view.value.ty = sy - (sy - view.value.ty) * k;
    view.value.s = ns;
  }
  function animateTo(tx: number, ty: number, s: number, dur = 380) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      view.value = { tx, ty, s };
      return;
    }
    const from = { ...view.value },
      t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur),
        e = 1 - Math.pow(1 - p, 3);
      view.value.tx = from.tx + (tx - from.tx) * e;
      view.value.ty = from.ty + (ty - from.ty) * e;
      view.value.s = from.s + (s - from.s) * e;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return { view, clamp, toWorld, zoomAt, animateTo };
}
