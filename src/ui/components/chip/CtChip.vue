<script setup lang="ts" vapor>
/**
 * A rounded pill. `color` tints it; `selected` fills it.
 * Pass `toggle` when it switches something on and off (sets aria-pressed).
 */
defineProps<{ color?: string; selected?: boolean; count?: number; toggle?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="ct-chip"
    type="button"
    :class="{ selected }"
    :style="color ? `--tint: ${color}` : undefined"
    :aria-pressed="toggle ? selected : undefined"
    @click="(e) => emit('click', e)"
  >
    <slot></slot>
    <span v-if="count != null" class="count">{{ count }}</span>
  </button>
</template>

<style scoped>
.ct-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-tool);
  font-size: var(--font-sm);
  font-weight: 700;
  /* the tint as text, pulled toward the tool's ink so it reads on either desk */
  color: color-mix(in oklch, var(--tint, var(--muted)) var(--tint-mix), var(--tint-base));
  transition: background-color var(--duration-swap) ease,
    color var(--duration-swap) ease,
    border-color var(--duration-swap) ease;

  &.selected {
    /* filled: the tint deepened enough to carry white text */
    background: color-mix(in oklch, var(--tint, var(--ink)) 85%, #1c2238);
    color: var(--on-accent);
    border-color: transparent;
  }
}

.count {
  font-size: var(--font-2xs);
  opacity: 0.7;
}
</style>
