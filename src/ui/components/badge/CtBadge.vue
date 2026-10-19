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
  <component
    :is="as"
    class="badge"
    :data-filled="filled || undefined"
    :data-dashed="dashed || undefined"
    :data-float="float || undefined"
    :data-busy="busy || undefined"
  >
    <slot></slot>
  </component>
</template>

<style scoped>
@import "../../styles/media.css";

.badge {
  flex-shrink: 0;
  display: inline-block;
  min-width: 22px;
  margin: 0;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--ink) 10%, transparent);
  color: var(--ink);
  font-size: var(--font-xs);
  font-weight: 700;
  line-height: 22px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  &[data-filled] {
    background: var(--ink);
    color: var(--on-ink);
  }

  &[data-dashed] {
    border: 1px dashed color-mix(in oklch, var(--ink) 45%, transparent);
    background: transparent;
    color: var(--muted);
    font-size: var(--font-2xs);
    line-height: 20px;
  }

  &[data-float] {
    padding: 4px 10px;
    background: var(--surface);
    box-shadow:
      inset 0 0 0 1px var(--line),
      var(--shadow-tool);
    line-height: 1.5;
    white-space: normal;
    text-align: start;
  }

  /* under way: a dot breathing before the words, which say what is happening */
  &[data-busy] {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    &::before {
      content: "";
      flex-shrink: 0;
      width: 6px;
      height: 6px;
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
