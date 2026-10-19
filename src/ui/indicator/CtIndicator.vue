<script lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/** Whichever child marks itself as the current choice */
const SELECTED = '[aria-selected="true"], [aria-checked="true"], [aria-current="page"]';

/**
 * Tracks the selected child of `list` so an indicator can morph to it.
 * `list` must be the indicator's positioned parent.
 */
export function useIndicator(list: Readonly<Ref<HTMLElement | null>>, watchSource: () => unknown) {
  const box = ref({ x: 0, y: 0, width: 0, height: 0 });
  // Stays false until the first position is painted, so the indicator
  // appears in place instead of sliding in from the corner.
  const ready = ref(false);

  async function measure() {
    await nextTick();
    const el = list.value?.querySelector<HTMLElement>(SELECTED) ?? null;
    if (el === null) return;
    box.value = {
      x: el.offsetLeft,
      y: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    if (!ready.value) requestAnimationFrame(() => (ready.value = true));
  }

  let observer: ResizeObserver | undefined;
  watch(watchSource, () => void measure());
  onMounted(() => {
    void measure();
    observer = new ResizeObserver(() => void measure());
    if (list.value !== null) observer.observe(list.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  /** The box for CtIndicator: null until a child is chosen and measured */
  const chosen = computed(() => (box.value.width === 0 ? null : box.value));
  const style = computed(
    () =>
      `width: ${box.value.width}px; height: ${box.value.height}px; transform: translate(${box.value.x}px, ${box.value.y}px)`,
  );
  return { chosen, style, ready };
}
</script>

<script setup lang="ts" vapor>
/**
 * A pill under (or around) the chosen one of a row of choices, the size of `box` (from the
 * corner of the positioned parent), `pad` out from it. Given another box it does not slide
 * as one: its leading edge sets off first, quick, and its trailing edge follows a beat later,
 * so on the way it stretches across the two and contracts onto the new one, like rubber
 * (after React Bits' Rubber Segment). Its `look`: `ink`, filled, for a chip; `ring`, hollow,
 * around a swatch; `surface`, a pale pill in a track (CtSegmented).
 *
 * `ready` once the first box has been painted, so it appears in place rather than
 * stretching in from the corner (useIndicator).
 */
const {
  box,
  ready,
  pad = 0,
  look = "ink",
} = defineProps<{
  box: { x: number; y: number; width: number; height: number } | null;
  ready: boolean;
  pad?: number;
  look?: "ink" | "ring" | "surface";
}>();

/** Which way the pill is going, which says which edge leads */
const dir = ref<"forward" | "back">("forward");
watch(
  () => box?.x,
  (x, was) => {
    if (x !== undefined && was !== undefined && x !== was) dir.value = x > was ? "forward" : "back";
  },
);
/** The pill's edges, from the parent's padding edge: the start inset and the end inset, the top and the height */
const edges = computed(() => {
  if (box === null) return undefined;
  return `--l: ${box.x - pad}px; --r: ${box.x + box.width + pad}px; --t: ${box.y - pad}px; --h: ${box.height + pad * 2}px`;
});
</script>

<template>
  <span
    aria-hidden="true"
    class="pill"
    :data-look="look"
    :data-dir="dir"
    :data-ready="ready || undefined"
    :data-shown="box !== null || undefined"
    :style="edges"
  ></span>
</template>

<style scoped>
.pill {
  /* the leading edge: off at once, quick; the trailing edge: a beat later, and longer */
  --lead: calc(var(--duration-morph) * 0.55) cubic-bezier(0.23, 1, 0.32, 1);
  --trail: calc(var(--duration-morph) * 0.85) cubic-bezier(0.23, 1, 0.32, 1)
    calc(var(--duration-morph) * 0.25);
  position: absolute;
  inset-block-start: var(--t, 0);
  inset-inline-start: var(--l, 0);
  inset-inline-end: calc(100% - var(--r, 0));
  height: var(--h, 0);
  border-radius: var(--radius-pill);
  opacity: 0;
  pointer-events: none;

  &[data-shown] {
    opacity: 1;
  }

  &[data-look="ink"] {
    background: var(--ink);
  }
  &[data-look="ring"] {
    box-shadow: inset 0 0 0 var(--ring-width) var(--ink);
  }
  &[data-look="surface"] {
    background: var(--surface);
    box-shadow: var(--shadow-tool), 0 0 0 var(--line-width) var(--line);
  }

  &[data-ready] {
    transition:
      inset-inline-start var(--trail),
      inset-inline-end var(--lead),
      inset-block-start var(--lead),
      height var(--lead);

    &[data-dir="back"] {
      transition:
        inset-inline-start var(--lead),
        inset-inline-end var(--trail),
        inset-block-start var(--lead),
        height var(--lead);
    }
  }
}
</style>
