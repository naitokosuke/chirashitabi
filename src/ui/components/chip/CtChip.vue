<script setup lang="ts" vapor>
/**
 * A rounded pill; `selected` fills it with ink.
 * Pass `toggle` when it switches something on and off (sets aria-pressed).
 */
defineProps<{ selected?: boolean; count?: number; toggle?: boolean }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    class="ct-chip"
    type="button"
    :class="{ selected }"
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
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  transition: background-color var(--duration-swap) ease,
    color var(--duration-swap) ease,
    border-color var(--duration-swap) ease;

  @media (hover: hover) {
    &:not(.selected):hover {
      color: var(--ink);
      border-color: color-mix(in oklch, var(--ink) 30%, var(--line));
    }
  }

  &.selected {
    background: var(--ink);
    color: var(--on-ink);
    border-color: var(--ink);
  }
}

.count {
  font-size: var(--font-2xs);
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}
</style>
