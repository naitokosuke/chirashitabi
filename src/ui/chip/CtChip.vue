<script setup lang="ts" vapor>
/**
 * A rounded pill; `selected` fills it with ink.
 * Pass `toggle` when it switches something on and off (sets aria-pressed).
 * `float` lifts it off what it floats over (a map, the desk) with a tool's shadow.
 * `dashed` draws its edge dashed: a chip that clears the others, or one the agent offered.
 * `size="sm"` is a chip set inside a box with others, as the chips of a CtChipInput.
 * `suggested` darkens its words and edge, short of filling it: one the words on the page name,
 * or the agent finds likely, so it reads as a pick and not only as one in use. `aside` is a
 * word after it, light and small (that the tag is new).
 */
defineProps<{
  selected?: boolean;
  count?: number;
  toggle?: boolean;
  float?: boolean;
  dashed?: boolean;
  size?: "md" | "sm";
  suggested?: boolean;
  aside?: string;
}>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    :data-selected="selected || undefined"
    :data-float="float || undefined"
    :data-dashed="dashed || undefined"
    :data-size="size === 'sm' ? 'sm' : undefined"
    :data-suggested="suggested || undefined"
    :aria-pressed="toggle ? selected : undefined"
    @click="(e) => emit('click', e)"
  >
    <slot></slot>
    <small v-if="count != null">{{ count }}</small>
    <small v-if="aside !== undefined" class="aside">{{ aside }}</small>
  </button>
</template>

<style scoped>
@import "../styles/media.css";
button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap);
  padding: 0 var(--space-6);
  border-radius: var(--radius-pill);
  border: var(--line-width) solid var(--line);
  background: var(--surface);
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--muted);
  transition:
    background-color var(--duration-swap) ease,
    color var(--duration-swap) ease,
    border-color var(--duration-swap) ease;
  @media (--can-hover) {
    &:not([data-selected]):hover {
      color: var(--ink);
      border-color: color-mix(in oklch, var(--ink) 30%, var(--line));
    }
  }
  &[data-selected] {
    background: var(--ink);
    color: var(--on-ink);
    border-color: var(--ink);
  }
  &[data-float] {
    box-shadow: var(--shadow-tool);
  }
  &[data-dashed] {
    border-style: dashed;
  }
  &[data-size="sm"] {
    min-height: var(--size-inset-control);
  }
  &[data-suggested]:not([data-selected]) {
    color: var(--ink);
    border-color: color-mix(in oklch, var(--ink) 45%, var(--line));
  }
  small {
    font-size: var(--font-2xs);
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }
  .aside {
    font-weight: 400;
    color: var(--muted);
    opacity: 1;
  }
}
</style>
