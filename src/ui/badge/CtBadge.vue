<script setup lang="ts" vapor>
/**
 * A small label, never pressed: a stamp (a card's day), a count, a state. On a wash of ink by
 * default; `filled` in ink for a count that asks to be seen; `dashed` for what is still
 * waiting (a booking to make); `float` on the surface, lifted over what it floats on (a note
 * over the map). `as` is the element it is (a `time` with its `datetime`, a `p` saying a line).
 * `busy` is a state still under way (a room reconnecting): a dot breathes before its words, as
 * on a CtButton.
 */
const { as = "span" } = defineProps<{
  as?: "span" | "small" | "time" | "p";
  filled?: boolean;
  dashed?: boolean;
  float?: boolean;
  busy?: boolean;
}>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <component :is="as" class="badge" :class="{ filled, dashed, float, busy }">
    <slot />
  </component>
</template>

<style scoped>
@import "/src/ui/styles/media.css";

.badge {
  flex-shrink: 0;
  display: inline-block;
  min-width: var(--size-badge);
  margin: 0;
  padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  background: color-mix(in oklch, var(--ink) 10%, transparent);
  color: var(--ink);
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: var(--size-badge);
  text-align: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  &.filled {
    background: var(--ink);
    color: var(--on-ink);
  }

  &.dashed {
    border: var(--line-width) dashed color-mix(in oklch, var(--ink) 45%, transparent);
    background: transparent;
    color: var(--muted);
    font-size: var(--font-2xs);
    line-height: calc(var(--size-badge) - 2 * var(--line-width));
  }

  &.float {
    padding: var(--space-2) var(--space-5);
    background: var(--surface);
    box-shadow:
      inset 0 0 0 var(--line-width) var(--line),
      var(--shadow-tool);
    line-height: 1.5;
    white-space: normal;
    text-align: start;
  }

  /* under way: a dot breathing before the words, which say what is happening */
  &.busy {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);

    &::before {
      content: "";
      flex-shrink: 0;
      width: var(--size-dot-sm);
      height: var(--size-dot-sm);
      border-radius: 50%;
      background: currentColor;
      animation: breathe 1s ease-in-out infinite alternate;

      @media (--reduced-motion) {
        animation: none;
      }
    }
  }
}

@keyframes breathe {
  from {
    opacity: 0.25;
  }
  to {
    opacity: 1;
  }
}
</style>
