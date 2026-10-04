<script setup lang="ts" vapor>
import { computed, useTemplateRef } from "vue";

import { useIndicator } from "../../composables/useIndicator";
import CtTarget from "../target/CtTarget.vue";

/**
 * Colors to pick one of: a row of them, the chosen one framed by a target's four corners
 * (CtTarget). Picking another, the corners fly there and lock on.
 */
const props = defineProps<{ colors: readonly string[]; selected: string; label: string }>();
const emit = defineEmits<{ select: [color: string] }>();

const root = useTemplateRef<HTMLElement>("root");
const { box, ready } = useIndicator(root, () => [props.selected, props.colors.length]);
const target = computed(() => (box.value.width === 0 ? null : box.value));
</script>

<template>
  <div ref="root" class="swatches" role="radiogroup" :aria-label="label">
    <CtTarget :box="target" :ready />
    <button
      v-for="(c, i) in colors"
      :key="c"
      role="radio"
      type="button"
      :aria-checked="selected === c"
      :aria-label="`${label} ${i + 1}`"
      :style="`--swatch: ${c}`"
      @click="() => emit('select', c)"
    ></button>
  </div>
</template>

<style scoped>
@import "../../styles/media.css";

.swatches {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;

  /* the color itself */
  > button {
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    border: 0;
    background: var(--swatch);

    &:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 8px;
    }
  }
}
</style>
