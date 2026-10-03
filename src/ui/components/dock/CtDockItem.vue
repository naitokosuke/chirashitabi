<script setup lang="ts" vapor>
import { ref } from "vue";

/**
 * One icon in the dock (`CtDock`). The icon says what it is; its name shows above it under
 * a hovering pointer and is the accessible name everywhere. `current` puts a dot under it,
 * as a dock marks what is open. Pressed, it gives one small bounce. With `href` it is a link
 * (a place of its own, which a modified click opens elsewhere), otherwise a button.
 */
const props = defineProps<{ label: string; current?: boolean; href?: string }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
defineSlots<{ default(): unknown }>();

const bouncing = ref(false);
function onClick(e: MouseEvent) {
  if (!props.current) bouncing.value = true;
  emit("click", e);
}
const settle = () => (bouncing.value = false);
</script>

<template>
  <a
    v-if="href !== undefined"
    data-dock-item
    :href
    :aria-label="label"
    :aria-current="current ? 'page' : undefined"
    :data-bounce="bouncing || undefined"
    @click="onClick"
    @animationend="settle"
  >
    <span class="icon"><slot></slot></span>
    <span aria-hidden="true" class="tip">{{ label }}</span>
    <span aria-hidden="true" class="dot"></span>
  </a>
  <button
    v-else
    data-dock-item
    type="button"
    :aria-label="label"
    :aria-current="current ? 'page' : undefined"
    :data-bounce="bouncing || undefined"
    @click="onClick"
    @animationend="settle"
  >
    <span class="icon"><slot></slot></span>
    <span aria-hidden="true" class="tip">{{ label }}</span>
    <span aria-hidden="true" class="dot"></span>
  </button>
</template>

<style scoped>
@import "../../styles/media.css";

a,
button {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: calc(var(--cell) * var(--m, 1));
  height: var(--cell);
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  /* following the pointer closely; letting go, springing back */
  transition:
    width 0.1s ease-out,
    color var(--duration-swap) ease;

  [data-dock]:not([data-magnify]) & {
    transition:
      width var(--duration-morph) var(--ease-spring),
      color var(--duration-swap) ease;
  }

  &[aria-current="page"] {
    color: var(--ink);
  }

  @media (--can-hover) {
    &:hover {
      color: var(--ink);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* the icon grows from its foot, up out of the glass */
  > .icon {
    display: grid;
    place-items: center;
    width: var(--cell);
    height: var(--cell);
    border-radius: 12px;
    scale: var(--m, 1);
    transform-origin: 50% 100%;
    transition:
      scale 0.1s ease-out,
      background-color var(--duration-swap) ease;

    [data-dock]:not([data-magnify]) & {
      transition:
        scale var(--duration-morph) var(--ease-spring),
        background-color var(--duration-swap) ease;
    }
  }

  &:active > .icon {
    background: var(--wash);
  }

  &[data-bounce] > .icon {
    animation: bounce 0.5s cubic-bezier(0.3, 0.7, 0.4, 1);

    @media (--reduced-motion) {
      animation-duration: 0.01s;
    }
  }

  /* its name, above it, once a pointer rests on it (or the keyboard is on it) */
  > .tip {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: calc(var(--cell) * var(--m, 1) + 10px);
    translate: -50% 4px;
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--on-ink);
    font-size: var(--font-xs);
    font-weight: 700;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.15s ease,
      translate 0.15s ease;
  }

  @media (--can-hover) {
    &:hover > .tip {
      opacity: 1;
      translate: -50% 0;
    }
  }
  &:focus-visible > .tip {
    opacity: 1;
    translate: -50% 0;
  }

  /* what is open: a dot under it */
  > .dot {
    position: absolute;
    inset-block-end: -6px;
    inset-inline-start: 50%;
    width: 4px;
    height: 4px;
    margin-inline-start: -2px;
    border-radius: 50%;
    background: var(--ink);
    scale: 0;
    transition: scale var(--duration-morph) var(--ease-spring);
  }

  &[aria-current="page"] > .dot {
    scale: 1;
  }
}

/* a dock's launch bounce, once, small */
@keyframes bounce {
  0%,
  100% {
    translate: 0 0;
  }
  30% {
    translate: 0 -12px;
  }
  55% {
    translate: 0 0;
  }
  72% {
    translate: 0 -4px;
  }
  86% {
    translate: 0 0;
  }
}
</style>
