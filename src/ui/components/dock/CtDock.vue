<script setup lang="ts" vapor>
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

/**
 * The app's one menu: a pane of glass floating at the bottom middle, over whatever view is
 * up, the same on every screen so moving between them never moves it. Under the item that is
 * open (`current`) sits one dot, and only the dot moves: it slides to the next one. It holds
 * `CtDockItem`s, `CtDockGroup`s of them that fold away, and `CtDockDivider`s.
 *
 * Under a mouse it magnifies like a dock: the icons near the pointer grow, the nearest the
 * most, and push their neighbours aside; they grow upward, out of the glass, so the dock
 * itself keeps its height. Distances are from where each icon rests, so the row does not
 * chase its own growth.
 *
 * `away` sinks it below the screen's edge while something covers the views (a sheet), and
 * brings it back up after.
 */
defineProps<{ label: string; away?: boolean }>();
defineSlots<{ default(): unknown }>();

/** How far the pointer reaches, and how much the icon under it grows */
const REACH = 120;
const GROW = 0.55;

const nav = useTemplateRef<HTMLElement>("nav");
const items = () =>
  [...(nav.value?.querySelectorAll<HTMLElement>("[data-dock-item]") ?? [])].filter(
    (el) => el.closest("[data-closed]") === null,
  );
/** Where each icon rests, measured as the pointer comes in, before anything has grown */
let rest: { el: HTMLElement; x: number }[] = [];
let pointer: number | null = null;
let frame = 0;

function magnify() {
  frame = 0;
  for (const { el, x } of rest) {
    if (pointer === null) {
      el.style.removeProperty("--m");
      continue;
    }
    const t = Math.max(0, 1 - Math.abs(pointer - x) / REACH);
    // smoothstep: a soft shoulder rather than a cone
    el.style.setProperty("--m", (1 + GROW * t * t * (3 - 2 * t)).toFixed(3));
  }
  placeDot();
}
const schedule = () => {
  if (frame === 0) frame = requestAnimationFrame(magnify);
};

/**
 * Where the dot is: under the middle of the open item, or nowhere when none is open (or it is
 * folded away). Placed once before it may slide, so it appears in place rather than flying in.
 */
const dot = ref<number | null>(null);
const dotReady = ref(false);
function placeDot() {
  const n = nav.value;
  const el = n?.querySelector<HTMLElement>('[data-dock-item][aria-current="page"]');
  if (!n || !el || el.closest("[data-closed]") !== null) {
    dot.value = null;
    return;
  }
  const a = n.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  dot.value = b.left - a.left + b.width / 2;
  if (!dotReady.value) requestAnimationFrame(() => (dotReady.value = true));
}
// what moves the dot: another item opening, a group folding, the dock's width changing
let watchers: { disconnect(): void }[] = [];
onMounted(() => {
  const n = nav.value;
  if (!n) return;
  const changed = new MutationObserver(placeDot);
  changed.observe(n, { subtree: true, attributeFilter: ["aria-current", "data-closed"] });
  const resized = new ResizeObserver(placeDot);
  resized.observe(n);
  watchers = [changed, resized];
  placeDot();
});
onBeforeUnmount(() => watchers.forEach((w) => w.disconnect()));

function onEnter(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  rest = items().map((el) => {
    const r = el.getBoundingClientRect();
    return { el, x: r.left + r.width / 2 };
  });
  nav.value?.setAttribute("data-magnify", "");
}
function onMove(e: PointerEvent) {
  if (e.pointerType !== "mouse" || rest.length === 0) return;
  pointer = e.clientX;
  schedule();
}
function onLeave() {
  pointer = null;
  nav.value?.removeAttribute("data-magnify");
  schedule();
}
</script>

<template>
  <nav
    ref="nav"
    data-dock
    :aria-label="label"
    :data-away="away || undefined"
    :inert="away"
    @pointerenter="onEnter"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <slot></slot>
    <span
      aria-hidden="true"
      class="dot"
      :data-ready="dotReady || undefined"
      :data-shown="dot !== null || undefined"
      :style="dot === null ? undefined : `--x: ${dot}px`"
    ></span>
  </nav>
</template>

<style scoped>
@import "../../styles/media.css";

nav {
  /* an icon's cell at rest; `--m` (per item) is how much it has grown under the pointer */
  --cell: 40px;
  @media (--wide) {
    --cell: 44px;
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
  max-width: calc(100vw - 16px);
  padding: 0 8px;
  border-radius: 22px;
  background: var(--glass);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  /* a hairline, and a lit top edge as glass has */
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--line) 80%, transparent),
    inset 0 1px 0 light-dark(rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.08)),
    var(--shadow-float);
  transition:
    translate var(--duration-morph) var(--ease-morph),
    opacity var(--duration-swap) ease;

  /* what is open: one dot under it, sliding to the next */
  > .dot {
    position: absolute;
    inset-inline-start: 0;
    inset-block-end: 5px;
    width: 4px;
    height: 4px;
    margin-inline-start: -2px;
    border-radius: 50%;
    background: var(--ink);
    translate: var(--x, 0) 0;
    opacity: 0;
    pointer-events: none;

    &[data-shown] {
      opacity: 1;
    }

    &[data-ready] {
      transition:
        translate var(--duration-morph) var(--ease-morph),
        opacity var(--duration-swap) ease;
    }
  }

  &[data-away] {
    translate: 0 calc(100% + var(--dock-gap) + env(safe-area-inset-bottom, 0px));
    opacity: 0;
  }
}
</style>
