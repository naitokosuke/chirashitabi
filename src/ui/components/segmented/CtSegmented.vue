<script setup lang="ts" generic="V extends string" vapor>
import { computed, ref, useTemplateRef, watch } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import type { CtOption } from "../../types";

/**
 * A few options in a track, one chosen, a pill under it. Picking another, the pill does not
 * slide as one: its leading edge sets off first, quick, and its trailing edge follows a beat
 * later, so on the way it stretches across the two and contracts onto the new one, like
 * rubber (after React Bits' Rubber Segment). Choices that stand free of a track (swatches,
 * chips) take a target's corners instead (CtTarget).
 */
const props = defineProps<{ options: readonly CtOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();

const list = useTemplateRef<HTMLElement>("list");
const { box, ready } = useIndicator(list, () => [props.modelValue, props.options.length]);

/** Which way the pill is going, which says which edge leads */
const dir = ref<"forward" | "back">("forward");
watch(
  () => box.value.x,
  (x, was) => {
    if (x !== was) dir.value = x > was ? "forward" : "back";
  },
);
/** The pill's edges, from the track's padding edge: the start inset, and the end inset */
const edges = computed(
  () =>
    `--l: ${box.value.x}px; --r: ${box.value.x + box.value.width}px; --h: ${box.value.height}px`,
);
</script>

<template>
  <div ref="list" role="radiogroup" :aria-label="label">
    <!-- the chosen option's pill, stretching from one to the next -->
    <span aria-hidden="true" :data-ready="ready || undefined" :data-dir="dir" :style="edges"></span>
    <button
      v-for="o in options"
      :key="o.value"
      role="radio"
      type="button"
      :aria-checked="o.value === modelValue"
      @click="() => emit('update:modelValue', o.value)"
    >{{ o.label }}</button>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

[role="radiogroup"] {
  position: relative;
  display: flex;
  padding: 2px;
  border-radius: 999px;
  background: var(--wash);

  > span {
    /* the leading edge: off at once, quick; the trailing edge: a beat later, and longer */
    --lead: calc(var(--duration-morph) * 0.55) cubic-bezier(0.23, 1, 0.32, 1);
    --trail: calc(var(--duration-morph) * 0.85) cubic-bezier(0.23, 1, 0.32, 1)
      calc(var(--duration-morph) * 0.25);
    position: absolute;
    inset-block-start: 2px;
    inset-inline-start: var(--l, 0);
    inset-inline-end: calc(100% - var(--r, 0));
    height: var(--h, 0);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--shadow-tool), 0 0 0 1px var(--line);
    pointer-events: none;

    /* placed before it moves: it appears where it belongs instead of stretching in from the corner */
    &[data-ready] {
      transition:
        inset-inline-start var(--trail),
        inset-inline-end var(--lead);

      &[data-dir="back"] {
        transition:
          inset-inline-start var(--lead),
          inset-inline-end var(--trail);
      }
    }
  }

  > button {
    position: relative;
    min-height: 32px; /* with the track's 2px it is the 36px a thumb is asked to hit */
    padding: 0 12px;
    border-radius: 999px;
    font-size: var(--font-sm);
    font-weight: 700;
    color: var(--muted);
    transition: color var(--duration-swap) ease;

    &[aria-checked="true"] {
      color: var(--ink);
    }

    @media (--can-hover) {
      &:not([aria-checked="true"]):hover {
        color: var(--ink);
      }
    }
  }
}
</style>
