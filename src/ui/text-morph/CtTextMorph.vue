<script setup lang="ts" vapor>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";

import { align, flatten, type Glyph, type MorphPart } from "./glyphs";

/**
 * Text that morphs instead of being replaced: when `parts` change, the characters the old and
 * new text share stay and slide to their new place, the others fade out where they were and in
 * where they go. "1日目 11/3" to "2日目 11/4" moves only the digits. A part's `tone` is a class
 * on its characters, for the parent to style with `:deep(.tone)`.
 */
const props = defineProps<{ parts: readonly MorphPart[] }>();

let last = 0;
const mint = () => ++last;
const glyphs = shallowRef<Glyph[]>(align([], flatten(props.parts), mint));
const text = computed(() => props.parts.map((p) => p.text).join(""));

const root = useTemplateRef<HTMLElement>("root");
const exits = useTemplateRef<HTMLElement>("exits");
const glyphEls = () => [...(root.value?.querySelectorAll<HTMLElement>("[data-g]") ?? [])];

watch(
  () => props.parts.map((p) => `${p.tone ?? ""}\u0000${p.text}`).join("\u0001"),
  async () => {
    const next = align(glyphs.value, flatten(props.parts), mint);
    const el = root.value;
    const css = el === null ? null : getComputedStyle(el);
    const duration = css === null ? 0 : parseFloat(css.getPropertyValue("--duration-swap")) * 1000;
    // NaN when the property is unset
    if (el === null || css === null || !(duration > 0)) {
      glyphs.value = next;
      return;
    }
    const eased = css.getPropertyValue("--ease-morph").trim();
    const easing = eased === "" ? "ease-out" : eased;
    // how much the characters blur as they come and go (tokens.css)
    const blur = `blur(${css.getPropertyValue("--blur-morph").trim()})`;

    // where every character is now
    const before = new Map<number, { x: number; y: number }>();
    for (const g of glyphEls())
      before.set(Number(g.dataset.g), { x: g.offsetLeft, y: g.offsetTop });

    // the leaving ones: a copy stays where it was and fades, outside the list Vue keeps
    const staying = new Set(next.map((g) => g.id));
    for (const g of glyphEls()) {
      if (staying.has(Number(g.dataset.g))) continue;
      const ghost = g.cloneNode(true);
      if (!(ghost instanceof HTMLElement)) continue;
      ghost.removeAttribute("data-g");
      ghost.style.cssText = `position:absolute;left:${g.offsetLeft}px;top:${g.offsetTop}px`;
      exits.value?.append(ghost);
      ghost
        .animate(
          [
            { opacity: 1, filter: "blur(0)", transform: "none" },
            { opacity: 0, filter: blur, transform: "translateY(-0.3em)" },
          ],
          { duration, easing },
        )
        .finished.finally(() => ghost.remove());
    }

    glyphs.value = next;
    await nextTick();

    for (const g of glyphEls()) {
      const was = before.get(Number(g.dataset.g));
      if (was !== undefined) {
        const dx = was.x - g.offsetLeft;
        const dy = was.y - g.offsetTop;
        if (dx !== 0 || dy !== 0)
          g.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
            duration,
            easing,
          });
      } else {
        g.animate(
          [
            { opacity: 0, filter: blur, transform: "translateY(0.3em)" },
            { opacity: 1, filter: "blur(0)", transform: "none" },
          ],
          { duration, easing, fill: "backwards" },
        );
      }
    }
  },
);
</script>

<template>
  <span ref="root">
    <!-- the whole text, once, for screen readers; the characters are hidden from them -->
    <span>{{ text }}</span>
    <span v-for="g in glyphs" :key="g.id" aria-hidden="true" :class="g.tone" :data-g="g.id">{{
      g.ch
    }}</span>
    <!-- the leaving characters' copies, over the row and out of its flow -->
    <span ref="exits" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
/* the row, and each character in it: a character moves as a box */
span {
  position: relative;
  display: inline-block;
  white-space: pre;
  > span:first-child {
    position: absolute;
    width: var(--space-px);
    height: var(--space-px);
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  > span:last-child {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
}
</style>
