<script setup lang="ts" vapor>
/**
 * A heading at one of the app's few sizes, by what it heads:
 *
 * - `page`: the large title a page opens with (a trip's name, the app's name).
 * - `sheet`: the title of a sheet over a view (a new note, a new trip).
 * - `section`: a part of a page (to-dos, people, a day in the booklet).
 * - `card`: what a card is (a pin's note).
 * - `minor`: a small heading inside a section.
 *
 * `as` is its rank in the page's outline (`h1`, `h2`, `h3`), which the size does not decide;
 * a `legend` names its fieldset (a flight in the trip's settings) and a `p` heads a part that is
 * not in the outline (one stay of a few).
 * `muted` steps it back into the muted ink. Where it sits (its margins) is the owner's.
 */
const { as = "h2", level = "section" } = defineProps<{
  as?: "h1" | "h2" | "h3" | "legend" | "p";
  level?: "page" | "sheet" | "section" | "card" | "minor";
  muted?: boolean;
}>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <component :is="as" class="heading" :class="[`level-${level}`, { muted }]">
    <slot></slot>
  </component>
</template>

<style scoped>
/* no margin (nor a legend's room) of its own, at no weight, so the owner's margin always holds */
:where(.heading) {
  margin: 0;
  padding: 0;
}

.heading {
  font-weight: 700;
  overflow-wrap: anywhere;

  &.level-page {
    font-size: var(--font-display);
    line-height: 1.2;
  }
  &.level-sheet {
    font-size: var(--font-4xl);
    line-height: 1.25;
  }
  &.level-section {
    font-size: var(--font-2xl);
    line-height: 1.35;
  }
  &.level-card {
    font-size: var(--font-lg);
    line-height: 1.4;
  }
  &.level-minor {
    font-size: var(--font-md);
    line-height: 1.5;
  }

  &.muted {
    color: var(--muted);
  }
}
</style>
