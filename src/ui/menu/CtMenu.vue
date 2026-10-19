<script setup lang="ts" vapor>
import { useTemplateRef } from "vue";

/**
 * A menu of what can be done to the thing it opened from (a card on the desk), floating over
 * the view at `x`, `y` from the corner of its positioned parent; where that is, the owner works
 * out, measuring it with `size()`. It is a toolbar: ← and → walk its buttons, Esc asks to
 * close it (`close`). A press inside it stays in it, so what it floats over (a desk that pans)
 * never takes it. It holds `CtMenuItem`s, and `CtMenuGroup`s of things picked in it.
 *
 * `focusFirst()` puts the keyboard on its first button; `holdsFocus()` says whether it is in it.
 */
defineProps<{ label: string; x: number; y: number }>();
const emit = defineEmits<{ close: [] }>();
defineSlots<{ default(): unknown }>();

const root = useTemplateRef<HTMLElement>("root");
const buttons = () => [...(root.value?.querySelectorAll<HTMLElement>("button") ?? [])];

/** Left and right walk the buttons, as in any toolbar; Esc closes it (one handler: two on one element collide) */
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
    return;
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const all = buttons();
  const i = all.findIndex((b) => b === document.activeElement);
  const next = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
  e.preventDefault();
  next?.focus();
}

defineExpose({
  size: () => ({ width: root.value?.offsetWidth ?? 0, height: root.value?.offsetHeight ?? 0 }),
  focusFirst: () => buttons()[0]?.focus(),
  holdsFocus: () => root.value?.contains(document.activeElement) ?? false,
});
</script>

<template>
  <div
    ref="root"
    role="toolbar"
    :aria-label="label"
    :style="`inset-inline-start: ${x}px; inset-block-start: ${y}px`"
    @pointerdown.stop
    @keydown="onKey"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
div {
  position: absolute;
  z-index: var(--z-menu);
  max-width: calc(100% - var(--space-8));
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-7);
  background: var(--surface);
  box-shadow:
    inset 0 0 0 var(--line-width) var(--line),
    var(--shadow-float);
}
</style>
