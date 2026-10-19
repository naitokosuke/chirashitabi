<script setup lang="ts" vapor>
import { safeUrl } from "../url";

/**
 * A way out to another page, as words in a line: underlined, in ink and bold, opened in a new
 * tab. `href` goes through safeUrl, so an address the room typed never runs as script. Like a
 * CtButton variant="text", it is a thumb's height to hit, taken back out of the line so the
 * line keeps its own; it takes the line's size. `quiet` writes it in the line's own muted ink
 * and weight, for a link that is not what the line is about (the way to a stay on a map).
 * `inline` is a link among the words of running text (an address in a note): it breaks with
 * them and keeps their weight. On paper, its ink is the paper's (tokens.css, data-paper).
 */
defineProps<{ href: string | null | undefined; quiet?: boolean; inline?: boolean }>();
defineSlots<{ default(): unknown }>();
</script>

<template>
  <a
    :href="safeUrl(href)"
    :data-quiet="quiet || undefined"
    :data-inline="inline || undefined"
    rel="noopener noreferrer"
    target="_blank"
  >
    <slot />
  </a>
</template>

<style scoped>
a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  margin-block: calc((1lh - var(--tap)) / 2);
  border-radius: var(--radius-2);
  color: var(--ink);
  font-weight: 700;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: var(--underline-offset);

  &[data-quiet] {
    color: var(--muted);
    font-weight: inherit;
  }

  &[data-inline] {
    display: inline;
    min-height: 0;
    margin-block: 0;
    font-weight: inherit;
  }
}
</style>
