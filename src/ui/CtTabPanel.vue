<script setup lang="ts" vapor>
import { nextTick, useTemplateRef, watch } from "vue";

/** Morphs its content in whenever `value` changes */
const props = defineProps<{ value: string }>();
const panel = useTemplateRef<HTMLElement>("panel");

// Not <Transition :key>: Vize's Vapor output drops keys inside <Transition>,
// so the content is animated in place once the new value has rendered.
watch(
  () => props.value,
  async () => {
    await nextTick();
    const el = panel.value;
    if (!el) return;
    const css = getComputedStyle(el);
    const duration = parseFloat(css.getPropertyValue("--duration-swap")) * 1000;
    if (!duration) return; // reduced motion
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration, easing: css.getPropertyValue("--ease-morph").trim() || "ease-out" },
    );
  },
);
</script>

<template>
  <div ref="panel" class="ct-tab-panel" role="tabpanel">
    <slot></slot>
  </div>
</template>
