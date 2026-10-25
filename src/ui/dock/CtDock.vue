<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

import { dotOf, magnification, restOf, type Measured } from "./dock";

/**
 * The app's one menu: a pane of glass floating at the bottom middle, over whatever view is
 * up, the same on every screen so moving between them never moves it. Under the item that is
 * open (`current`) sits one dot, and only the dot moves: it slides to the next one. It holds
 * `CtDockItem`s, `CtDockGroup`s of them that fold away, and `CtDockDivider`s.
 *
 * Under a mouse it magnifies like a dock: the icons near the pointer grow, the nearest the
 * most, and push their neighbours aside; they grow upward, out of the glass, so the dock
 * itself keeps its height (not when motion is to be reduced). Distances are from where each icon rests (dock.ts), worked out
 * from where the icons are at that moment, so the row does not chase its own growth. The
 * dot has no part in it: it marks what is open, and sits still while icons grow around it.
 *
 * `away` sinks it below the screen's edge while something covers the views (a sheet), and
 * brings it back up after.
 */
defineProps<{ label: string; away?: boolean }>();
defineSlots<{ default(): unknown }>();

const nav = useTemplateRef<HTMLElement>("nav");
const items = () =>
  [...(nav.value?.querySelectorAll<HTMLElement>("[data-dock-item]") ?? [])].filter(
    (el) => el.closest(".closed") === null,
  );
const middle = (r: DOMRect) => r.left + r.width / 2;
/** The icons as they are now, and where each rests */
function measure(n: HTMLElement) {
  const cell = parseFloat(getComputedStyle(n).getPropertyValue("--cell"));
  const els = items();
  const now: Measured[] = els.map((el) => {
    const r = el.getBoundingClientRect();
    return { x: middle(r), width: r.width };
  });
  return { els, rest: restOf(now, cell) };
}

let pointer: number | null = null;
let frame = 0;

function magnify() {
  frame = 0;
  const n = nav.value;
  if (n === null) return;
  const { els, rest } = measure(n);
  els.forEach((el, i) => {
    if (pointer === null) el.style.removeProperty("--m");
    else el.style.setProperty("--m", magnification(pointer - (rest[i] ?? 0)).toFixed(3));
  });
}
const schedule = () => {
  if (frame === 0) frame = requestAnimationFrame(magnify);
};

/**
 * Where the dot is, from the dock's middle: under where the open item rests, or nowhere when
 * none is open (or it is folded away). Placed once before it may slide, so it appears in
 * place rather than flying in.
 */
const dot = ref<number | null>(null);
const dotReady = ref(false);
/** Under a mouse, the icons magnify (and settle back when it leaves) */
const magnifying = ref(false);
function placeDot() {
  const n = nav.value;
  if (n === null) return;
  const { els, rest } = measure(n);
  const current = els.findIndex((el) => el.getAttribute("aria-current") === "page");
  const r = n.getBoundingClientRect();
  dot.value = dotOf(rest, current, { x: middle(r), width: r.width });
  if (!dotReady.value) requestAnimationFrame(dotPlaced);
}
/** Placed and painted once: from now on it slides (set again, it is set to the same) */
function dotPlaced() {
  dotReady.value = true;
}
// what moves the dot: another item opening, a group folding, the dock's width changing
let watchers: { disconnect(): void }[] = [];
onMounted(() => {
  const n = nav.value;
  if (n === null) return;
  const changed = new MutationObserver(placeDot);
  changed.observe(n, { subtree: true, attributeFilter: ["aria-current", "class"] });
  const resized = new ResizeObserver(placeDot);
  resized.observe(n);
  watchers = [changed, resized];
  placeDot();
});
onBeforeUnmount(() => {
  watchers.forEach((w) => w.disconnect());
  cancelAnimationFrame(frame);
});

function onEnter(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  // growing and pushing aside under the pointer is motion: none when it is to be reduced
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  magnifying.value = true;
  pointer = e.clientX;
  schedule();
}
function onMove(e: PointerEvent) {
  if (!magnifying.value) return;
  pointer = e.clientX;
  schedule();
}
function onLeave() {
  pointer = null;
  magnifying.value = false;
  schedule();
}
</script>

<template>
  <nav
    ref="nav"
    data-dock
    :aria-label="label"
    :class="{ away, magnify: magnifying }"
    :inert="away"
    @pointerenter="onEnter"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <slot></slot>
    <span
      aria-hidden="true"
      class="dot"
      :class="{ ready: dotReady, shown: dot !== null }"
      :style="dot === null ? undefined : `--x: ${dot}px`"
    ></span>
  </nav>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

nav {
  /* an icon's cell at rest; `--m` (per item) is how much it has grown under the pointer */
  --cell: var(--size-dock-cell);
  @media (--wide) {
    --cell: var(--size-dock-cell-wide);
  }

  position: fixed;
  /* centred by its margins, so its whole width is the screen's, not half of it */
  inset-inline: 0;
  margin-inline: auto;
  width: fit-content;
  inset-block-end: calc(env(safe-area-inset-bottom, 0px) + var(--dock-gap));
  z-index: var(--z-dock);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  height: var(--dock-height);
  max-width: calc(100vw - var(--space-8));
  padding: 0 var(--space-4);
  border-radius: var(--radius-11);
  background: var(--glass);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  /* a hairline, and a lit top edge as glass has */
  box-shadow:
    var(--glass-edge),
    inset 0 var(--line-width) 0 light-dark(rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.08)),
    var(--shadow-float);
  transition:
    translate var(--duration-morph) var(--ease-morph),
    opacity var(--duration-swap) ease;

  /* what is open: one dot under it, from the middle of the dock, sliding to the next */
  > .dot {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: var(--space-2);
    width: var(--size-dot-xs);
    height: var(--size-dot-xs);
    margin-inline-start: calc(var(--size-dot-xs) / -2);
    border-radius: 50%;
    background: var(--ink);
    translate: var(--x, 0) 0;
    opacity: 0;
    pointer-events: none;

    &.shown {
      opacity: 1;
    }

    &.ready {
      transition:
        translate var(--duration-morph) var(--ease-morph),
        opacity var(--duration-swap) ease;
    }
  }

  &.away {
    translate: 0 calc(100% + var(--dock-gap) + env(safe-area-inset-bottom, 0px));
    opacity: 0;
  }
}
</style>
