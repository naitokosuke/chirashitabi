import { reactive } from 'vue'

/**
 * Screen <-> world transform. world = (screen - t) / s
 * Kept outside Pinia on purpose: it changes on every pointer move while panning,
 * and nothing but the canvas needs it.
 */
export function useViewport() {
  const view = reactive({ tx: 0, ty: 0, s: 1 })
  const clamp = (s: number) => Math.min(3, Math.max(0.3, s))
  const toWorld = (sx: number, sy: number) => ({ x: (sx - view.tx) / view.s, y: (sy - view.ty) / view.s })
  function zoomAt(sx: number, sy: number, factor: number) {
    const ns = clamp(view.s * factor), k = ns / view.s
    view.tx = sx - (sx - view.tx) * k
    view.ty = sy - (sy - view.ty) * k
    view.s = ns
  }
  function animateTo(tx: number, ty: number, s: number, dur = 380) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(view, { tx, ty, s }); return }
    const from = { ...view }, t0 = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      view.tx = from.tx + (tx - from.tx) * e
      view.ty = from.ty + (ty - from.ty) * e
      view.s = from.s + (s - from.s) * e
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  return { view, clamp, toWorld, zoomAt, animateTo }
}
