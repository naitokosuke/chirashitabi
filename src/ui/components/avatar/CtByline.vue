<script setup lang="ts" vapor>
import CtAvatar from "./CtAvatar.vue";

/**
 * Whose something is, as a line: the dot of their color (CtAvatar size="dot"), then the words
 * (their name, or who sent it), in muted ink. With no `color`, only the words. `size="xs"` is
 * one of a row's small notes (who is to do a to-do); `strong` sets the words in bold, for a line
 * that heads what it is about (who an invitation is from). `as` is the element it is (a `p`
 * when it is a line of its own).
 */
const { as = "span", size = "md" } = defineProps<{
  as?: "span" | "p";
  color?: string;
  size?: "xs" | "md";
  strong?: boolean;
}>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <component :is="as" class="byline" :data-size="size" :data-strong="strong || undefined"><CtAvatar
      v-if="color !== undefined"
      :color
      size="dot"
    /><slot></slot></component>
</template>

<style scoped>
.byline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted);

  &[data-size="xs"] {
    gap: 4px;
    font-size: var(--font-xs);
  }

  &[data-strong] {
    gap: 8px;
    font-weight: 700;
  }
}
</style>
